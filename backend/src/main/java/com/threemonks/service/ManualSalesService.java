package com.threemonks.service;

import com.threemonks.dto.CollectionActualRequest;
import com.threemonks.dto.ManualSalesImportResponse;
import com.threemonks.dto.ManualSalesRequest;
import com.threemonks.dto.ManualSalesResponse;
import com.threemonks.entity.CollectionActual;
import com.threemonks.entity.ManualDailySales;
import com.threemonks.entity.Shop;
import com.threemonks.enums.Role;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.exception.UnauthorizedException;
import com.threemonks.repository.CollectionActualRepository;
import com.threemonks.repository.ManualDailySalesRepository;
import com.threemonks.repository.ShopRepository;
import com.threemonks.security.UserPrincipal;
import com.threemonks.util.BusinessDay;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Daily sales for branches that take orders by hand (e.g. Hinjewadi): each day's
 * shots and blends, the amount worked out from the branch's prices, and the cash
 * and UPI actually received. These days are added to every sales report next to
 * app orders, branch by branch.
 */
@Service
@RequiredArgsConstructor
public class ManualSalesService {

    private static final int MAX_IMPORT_ROWS = 2000;

    private final ManualDailySalesRepository manualRepository;
    private final CollectionActualRepository actualRepository;
    private final ShopRepository shopRepository;
    private final CollectionService collectionService;

    // ---------- Daily Sales page ----------

    /** Manual-sales branches this user may enter for: admins all, a manager their own. */
    public List<Shop> shopsFor(UserPrincipal user) {
        return shopRepository.findAll().stream()
                .filter(Shop::isManualSales)
                .filter(s -> user.getRole() == Role.SUPER_ADMIN || s.getId().equals(user.getShopId()))
                .sorted(Comparator.comparing(Shop::getName))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ManualSalesResponse list(Long shopId, LocalDate from, LocalDate to, UserPrincipal user) {
        Shop shop = manualShop(shopId, user);
        if (to == null) to = BusinessDay.today();
        if (from == null) from = to.withDayOfMonth(1);
        if (from.isAfter(to)) throw new BadRequestException("'From' date cannot be after 'To' date");

        Map<LocalDate, CollectionActual> received = actualRepository.findByCollectionDateBetween(from, to).stream()
                .filter(a -> a.getShop().getId().equals(shop.getId()))
                .collect(Collectors.toMap(CollectionActual::getCollectionDate, a -> a));
        List<ManualSalesResponse.Day> days = new ArrayList<>();
        long shots = 0, blends = 0;
        BigDecimal amount = BigDecimal.ZERO, cash = BigDecimal.ZERO, upi = BigDecimal.ZERO, diff = BigDecimal.ZERO;
        boolean anyReceived = false;
        for (ManualDailySales m : manualRepository.findByShopIdAndSalesDateBetweenOrderBySalesDateDesc(shop.getId(), from, to)) {
            CollectionActual a = received.get(m.getSalesDate());
            BigDecimal rTotal = a == null ? null : a.getActualCash().add(a.getActualUpi());
            days.add(ManualSalesResponse.Day.builder()
                    .date(m.getSalesDate()).shots(m.getShots()).blends(m.getBlends())
                    .shotPrice(m.getShotPrice()).blendPrice(m.getBlendPrice()).amount(m.getAmount())
                    .receivedCash(a == null ? null : a.getActualCash())
                    .receivedUpi(a == null ? null : a.getActualUpi())
                    .receivedTotal(rTotal)
                    .difference(rTotal == null ? null : rTotal.subtract(m.getAmount()))
                    .note(a == null ? null : a.getNote())
                    .updatedBy(m.getUpdatedBy()).updatedAt(m.getUpdatedAt())
                    .build());
            shots += m.getShots();
            blends += m.getBlends();
            amount = amount.add(m.getAmount());
            if (a != null) {
                anyReceived = true;
                cash = cash.add(a.getActualCash());
                upi = upi.add(a.getActualUpi());
                diff = diff.add(rTotal.subtract(m.getAmount()));
            }
        }
        return ManualSalesResponse.builder()
                .shopId(shop.getId()).shopName(shop.getName())
                .shotPrice(shop.getShotPrice()).blendPrice(shop.getBlendPrice())
                .days(days)
                .totals(ManualSalesResponse.Day.builder()
                        .shots((int) shots).blends((int) blends).amount(amount)
                        .receivedCash(anyReceived ? cash : null).receivedUpi(anyReceived ? upi : null)
                        .receivedTotal(anyReceived ? cash.add(upi) : null)
                        .difference(anyReceived ? diff : null)
                        .build())
                .build();
    }

    /** Creates or updates one day (sales and amount received together). */
    @Transactional
    public void save(ManualSalesRequest request, UserPrincipal user) {
        Shop shop = manualShop(request.getShopId(), user);
        if (request.getDate().isAfter(BusinessDay.today()))
            throw new BadRequestException("Cannot enter sales for a future date");
        upsert(shop, request.getDate(), request.getShots(), request.getBlends(),
                request.getReceivedCash(), request.getReceivedUpi(), request.getNote(), user.getUsername());
    }

    /** Removes one day's sales and amount received (e.g. entered against the wrong date). */
    @Transactional
    public void delete(Long shopId, LocalDate date, UserPrincipal user) {
        Shop shop = manualShop(shopId, user);
        ManualDailySales entry = manualRepository.findByShopIdAndSalesDate(shop.getId(), date)
                .orElseThrow(() -> new ResourceNotFoundException("No sales entered for that branch and date"));
        manualRepository.delete(entry);
        actualRepository.findByShopIdAndCollectionDate(shop.getId(), date).ifPresent(actualRepository::delete);
    }

    /**
     * Imports a sheet saved as CSV (Google Sheets: File → Download → CSV) with the
     * columns Date, Shots, Blends, Cash received, UPI received and an optional Note.
     * Every row is checked first; if any is wrong nothing is saved and the errors
     * are returned. Dates already entered are updated, not duplicated.
     */
    @Transactional
    public ManualSalesImportResponse importCsv(Long shopId, InputStream csv, UserPrincipal user) {
        Shop shop = manualShop(shopId, user);
        List<String[]> rows = readCsv(csv);
        List<String> errors = new ArrayList<>();
        if (rows.isEmpty()) {
            return ManualSalesImportResponse.builder().errors(List.of("The file is empty")).build();
        }

        // Columns by header name when there is a header row, otherwise in the documented order
        int[] col = {0, 1, 2, 3, 4, 5};
        int first = 0;
        String[] head = rows.get(0);
        if (head.length > 0 && !head[0].trim().isEmpty() && !Character.isDigit(head[0].trim().charAt(0))) {
            first = 1;
            col = columnsFromHeader(head, errors);
        }
        if (rows.size() - first > MAX_IMPORT_ROWS) {
            errors.add("Too many rows (" + (rows.size() - first) + "); import at most " + MAX_IMPORT_ROWS + " at a time");
        }
        if (!errors.isEmpty()) return ManualSalesImportResponse.builder().errors(errors).build();

        // Dates like 2/8/2026: day first (India), unless the file only makes sense month first
        boolean monthFirst = isMonthFirst(rows.subList(first, rows.size()), col[0]);
        LocalDate today = BusinessDay.today();
        Map<LocalDate, Object[]> parsed = new LinkedHashMap<>();
        for (int i = first; i < rows.size(); i++) {
            String[] r = rows.get(i);
            int line = i + 1;
            if (Arrays.stream(r).allMatch(c -> c == null || c.isBlank())) continue;
            LocalDate date = parseDate(cell(r, col[0]), monthFirst);
            Integer shots = parseCount(cell(r, col[1]));
            Integer blends = parseCount(cell(r, col[2]));
            BigDecimal cash = parseAmount(cell(r, col[3]));
            BigDecimal upi = parseAmount(cell(r, col[4]));
            String note = col[5] >= 0 ? cell(r, col[5]).trim() : "";
            List<String> problems = new ArrayList<>();
            if (date == null) problems.add("date \"" + cell(r, col[0]) + "\" not understood (use 08-02-2026)");
            else if (date.isAfter(today)) problems.add("date " + date + " is in the future");
            else if (date.getYear() < 2020) problems.add("date " + date + " looks wrong");
            else if (parsed.containsKey(date)) problems.add("date " + date + " appears more than once");
            if (shots == null) problems.add("shots \"" + cell(r, col[1]) + "\" must be a whole number");
            if (blends == null) problems.add("blends \"" + cell(r, col[2]) + "\" must be a whole number");
            if (cash == null) problems.add("cash \"" + cell(r, col[3]) + "\" must be an amount (0 if none)");
            if (upi == null) problems.add("UPI \"" + cell(r, col[4]) + "\" must be an amount (0 if none)");
            if (note.length() > 500) problems.add("note is longer than 500 characters");
            if (!problems.isEmpty()) {
                errors.add("Row " + line + ": " + String.join("; ", problems));
            } else {
                parsed.put(date, new Object[] {shots, blends, cash, upi, note});
            }
        }
        if (parsed.isEmpty() && errors.isEmpty()) errors.add("No data rows found");
        if (!errors.isEmpty()) return ManualSalesImportResponse.builder().errors(errors).build();

        int created = 0, updated = 0;
        for (Map.Entry<LocalDate, Object[]> e : parsed.entrySet()) {
            Object[] v = e.getValue();
            boolean existed = upsert(shop, e.getKey(), (Integer) v[0], (Integer) v[1], (BigDecimal) v[2], (BigDecimal) v[3],
                    (String) v[4], user.getUsername());
            if (existed) updated++; else created++;
        }
        return ManualSalesImportResponse.builder().created(created).updated(updated).errors(List.of()).build();
    }

    /** Saves a day; returns true when it already existed. Past days keep the prices they were entered with. */
    private boolean upsert(Shop shop, LocalDate date, int shots, int blends, BigDecimal cash, BigDecimal upi,
                           String note, String username) {
        Optional<ManualDailySales> existing = manualRepository.findByShopIdAndSalesDate(shop.getId(), date);
        ManualDailySales entry = existing.orElseGet(() -> ManualDailySales.builder()
                .shop(shop).salesDate(date)
                .shotPrice(shop.getShotPrice()).blendPrice(shop.getBlendPrice())
                .build());
        entry.setShots(shots);
        entry.setBlends(blends);
        entry.setAmount(entry.getShotPrice().multiply(BigDecimal.valueOf(shots))
                .add(entry.getBlendPrice().multiply(BigDecimal.valueOf(blends))));
        entry.setUpdatedBy(username);
        entry.setUpdatedAt(LocalDateTime.now(BusinessDay.ZONE));
        manualRepository.save(entry);

        CollectionActualRequest received = new CollectionActualRequest();
        received.setShopId(shop.getId());
        received.setDate(date);
        received.setActualCash(cash);
        received.setActualUpi(upi);
        received.setNote(note);
        collectionService.saveActual(received, username);
        return existing.isPresent();
    }

    private Shop manualShop(Long shopId, UserPrincipal user) {
        if (shopId == null) throw new BadRequestException("Branch is required");
        if (user.getRole() != Role.SUPER_ADMIN && !shopId.equals(user.getShopId())) {
            throw new UnauthorizedException("You can only enter sales for your own branch");
        }
        Shop shop = shopRepository.findById(shopId).orElseThrow(() -> new ResourceNotFoundException("Shop", "id", shopId));
        if (!shop.isManualSales()) {
            throw new BadRequestException(shop.getName() + " takes orders in the app; daily sales are entered only for manual branches");
        }
        if (shop.getShotPrice() == null || shop.getBlendPrice() == null) {
            throw new BadRequestException("Set the shot and blend prices for " + shop.getName() + " first (Shops → Edit)");
        }
        return shop;
    }

    // ---------- Totals for the reports ----------

    /** Shots, blends and amount for a set of manual days. */
    public static class Totals {
        public long shots;
        public long blends;
        public BigDecimal amount = BigDecimal.ZERO;

        void add(ManualDailySales m) {
            shots += m.getShots();
            blends += m.getBlends();
            amount = amount.add(m.getAmount());
        }
    }

    /** Per business date; shopId null = every branch. */
    @Transactional(readOnly = true)
    public Map<LocalDate, Totals> byDate(Long shopId, LocalDate from, LocalDate to) {
        Map<LocalDate, Totals> out = new HashMap<>();
        for (ManualDailySales m : entries(shopId, from, to)) out.computeIfAbsent(m.getSalesDate(), k -> new Totals()).add(m);
        return out;
    }

    /** Per branch over a period. */
    @Transactional(readOnly = true)
    public Map<Long, Totals> byShop(LocalDate from, LocalDate to) {
        Map<Long, Totals> out = new HashMap<>();
        for (ManualDailySales m : entries(null, from, to)) out.computeIfAbsent(m.getShop().getId(), k -> new Totals()).add(m);
        return out;
    }

    /** One branch (or all, when shopId is null) over a period. */
    @Transactional(readOnly = true)
    public Totals total(Long shopId, LocalDate from, LocalDate to) {
        Totals t = new Totals();
        entries(shopId, from, to).forEach(t::add);
        return t;
    }

    /** Amount only, for report code that works with time ranges (business-day bounds). */
    public BigDecimal amount(Long shopId, LocalDateTime start, LocalDateTime end) {
        return total(shopId, BusinessDay.dateOf(start), BusinessDay.dateOf(end)).amount;
    }

    private List<ManualDailySales> entries(Long shopId, LocalDate from, LocalDate to) {
        if (from == null || to == null || from.isAfter(to)) return List.of();
        return shopId == null
                ? manualRepository.findBySalesDateBetween(from, to)
                : manualRepository.findByShopIdAndSalesDateBetweenOrderBySalesDateDesc(shopId, from, to);
    }

    // ---------- CSV helpers ----------

    static List<String[]> readCsv(InputStream in) {
        List<String[]> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            boolean firstLine = true;
            while ((line = reader.readLine()) != null) {
                if (firstLine && line.startsWith("﻿")) line = line.substring(1);
                firstLine = false;
                rows.add(splitCsvLine(line));
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not read the file");
        }
        return rows;
    }

    // Handles quoted cells such as "2,000" from Google Sheets
    static String[] splitCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else if (c == '"') quoted = false;
                else cell.append(c);
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(c);
            }
        }
        cells.add(cell.toString());
        return cells.toArray(new String[0]);
    }

    private static int[] columnsFromHeader(String[] head, List<String> errors) {
        int[] col = {-1, -1, -1, -1, -1, -1};
        for (int i = 0; i < head.length; i++) {
            String h = head[i].trim().toLowerCase(Locale.ROOT);
            if (col[0] < 0 && h.contains("date")) col[0] = i;
            else if (col[1] < 0 && h.contains("shot")) col[1] = i;
            else if (col[2] < 0 && h.contains("blend")) col[2] = i;
            else if (col[3] < 0 && h.contains("cash")) col[3] = i;
            else if (col[4] < 0 && h.contains("upi")) col[4] = i;
            else if (col[5] < 0 && (h.contains("note") || h.contains("remark"))) col[5] = i;
        }
        String[] names = {"Date", "Shots", "Blends", "Cash received", "UPI received"};
        for (int i = 0; i < 5; i++) {
            if (col[i] < 0) errors.add("Column \"" + names[i] + "\" not found in the header row");
        }
        return col;
    }

    private static String cell(String[] row, int index) {
        return index >= 0 && index < row.length && row[index] != null ? row[index].trim() : "";
    }

    // Month first only when some date can't be day first (e.g. 2/13/2026) and none needs day first (13/2/2026)
    private static boolean isMonthFirst(List<String[]> rows, int dateCol) {
        boolean secondOver12 = false, firstOver12 = false;
        for (String[] r : rows) {
            String[] p = cell(r, dateCol).split("[/\\-.]");
            if (p.length != 3 || !p[0].matches("\\d{1,2}") || !p[1].matches("\\d{1,2}")) continue;
            if (Integer.parseInt(p[1]) > 12) secondOver12 = true;
            if (Integer.parseInt(p[0]) > 12) firstOver12 = true;
        }
        return secondOver12 && !firstOver12;
    }

    static LocalDate parseDate(String s, boolean monthFirst) {
        if (s == null || s.isBlank()) return null;
        s = s.trim();
        // Strict: an impossible date such as 31/02/2026 is an error, not quietly 28 Feb
        String[] patterns = monthFirst
                ? new String[] {"M/d/uuuu", "M-d-uuuu", "M.d.uuuu", "uuuu-M-d", "d-MMM-uuuu", "d MMM uuuu", "d-MMM-uu", "d MMMM uuuu"}
                : new String[] {"d/M/uuuu", "d-M-uuuu", "d.M.uuuu", "uuuu-M-d", "d-MMM-uuuu", "d MMM uuuu", "d-MMM-uu", "d MMMM uuuu"};
        for (String p : patterns) {
            try {
                return LocalDate.parse(s, DateTimeFormatter.ofPattern(p, Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT));
            } catch (Exception ignored) {
                // try the next format
            }
        }
        return null;
    }

    static Integer parseCount(String s) {
        String v = s.replace(",", "").trim();
        if (v.isEmpty()) return 0;
        if (!v.matches("\\d{1,6}")) return null;
        return Integer.parseInt(v);
    }

    static BigDecimal parseAmount(String s) {
        String v = s.replace("₹", "").replace("Rs.", "").replace("Rs", "").replace(",", "").trim();
        if (v.isEmpty()) return BigDecimal.ZERO;
        if (!v.matches("\\d{1,10}(\\.\\d{1,2})?")) return null;
        return new BigDecimal(v);
    }
}
