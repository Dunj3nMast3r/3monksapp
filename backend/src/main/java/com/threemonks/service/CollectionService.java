package com.threemonks.service;

import com.threemonks.util.BusinessDay;
import com.threemonks.dto.DailyCollectionResponse;
import com.threemonks.dto.DailyCollectionResponse.CollectionRow;
import com.threemonks.dto.CollectionActualRequest;
import com.threemonks.entity.CollectionActual;
import com.threemonks.entity.Shop;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.repository.CollectionActualRepository;
import com.threemonks.repository.OrderRepository;
import com.threemonks.repository.ShopRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Day-end reconciliation: units sold and cash/UPI taken, per branch and per day.
 *
 * <p>Collection is counted on every order that was not cancelled, including
 * orders still PENDING at the counter, because payment is taken when the order
 * is placed rather than when the stations hand it over. Cancelled orders are
 * reported separately so the till can be explained, never mixed into the
 * collected totals.
 *
 * <p>Admins can record what a branch actually received on a day (cash and UPI
 * separately). Rows then carry the actual amounts and the difference from what
 * the orders say, counted only over the branch-days that have an entry.
 */
@Service
@RequiredArgsConstructor
public class CollectionService {

    /** Guard against someone asking for years of days in one response. */
    private static final int MAX_DAYS = 92;

    private static final ZoneId SHOP_ZONE = ZoneId.of("Asia/Kolkata");

    private final OrderRepository orderRepository;
    private final ShopRepository shopRepository;
    private final CollectionActualRepository actualRepository;

    /** Records (or replaces) what a branch actually received on a day. */
    @Transactional
    public void saveActual(CollectionActualRequest request, String username) {
        if (request.getDate().isAfter(BusinessDay.today()))
            throw new BadRequestException("Cannot enter the amount received for a future date");
        Shop shop = shopRepository.findById(request.getShopId())
                .orElseThrow(() -> new ResourceNotFoundException("Shop", "id", request.getShopId()));
        CollectionActual actual = actualRepository
                .findByShopIdAndCollectionDate(shop.getId(), request.getDate())
                .orElseGet(() -> CollectionActual.builder().shop(shop).collectionDate(request.getDate()).build());
        actual.setActualCash(request.getActualCash());
        actual.setActualUpi(request.getActualUpi());
        String note = request.getNote() == null ? "" : request.getNote().trim();
        actual.setNote(note.isEmpty() ? null : note);
        actual.setUpdatedBy(username);
        actual.setUpdatedAt(LocalDateTime.now(SHOP_ZONE));
        actualRepository.save(actual);
    }

    /** Removes a branch's entry for a day, e.g. one entered against the wrong date. */
    @Transactional
    public void deleteActual(Long shopId, LocalDate date) {
        CollectionActual actual = actualRepository.findByShopIdAndCollectionDate(shopId, date)
                .orElseThrow(() -> new ResourceNotFoundException("No amount received was entered for that branch and date"));
        actualRepository.delete(actual);
    }

    public DailyCollectionResponse getDailyCollection(LocalDate fromDate, LocalDate toDate, Long shopId) {
        if (fromDate == null)
            fromDate = BusinessDay.today();
        if (toDate == null)
            toDate = fromDate;
        if (toDate.isBefore(fromDate))
            throw new BadRequestException("'to' date cannot be before 'from' date");

        long days = ChronoUnit.DAYS.between(fromDate, toDate) + 1;
        if (days > MAX_DAYS)
            throw new BadRequestException("Date range cannot exceed " + MAX_DAYS + " days");

        LocalDateTime start = BusinessDay.start(fromDate);
        LocalDateTime end = BusinessDay.end(toDate);

        // Branch names for every branch we may report, active ones included even
        // when they sold nothing, so a missing branch reads as zero and not as absent.
        Map<Long, String> shopNames = new LinkedHashMap<>();
        for (Shop shop : shopRepository.findByActiveTrue()) {
            if (shopId == null || shopId.equals(shop.getId()))
                shopNames.put(shop.getId(), shop.getName());
        }

        Map<Long, Bucket> perBranch = new LinkedHashMap<>();
        Map<LocalDate, Bucket> perDay = new LinkedHashMap<>();
        // Expected cash/UPI for each branch on each day, to compare with what was actually received
        Map<Slot, Bucket> perSlot = new HashMap<>();
        for (Long id : shopNames.keySet())
            perBranch.put(id, new Bucket());
        for (LocalDate d = fromDate; !d.isAfter(toDate); d = d.plusDays(1))
            perDay.put(d, new Bucket());

        // Cash / UPI / cancelled, grouped by day, branch, payment mode and status
        for (Object[] row : orderRepository.getCollectionBreakdown(start, end, BusinessDay.startHour())) {
            LocalDate date = toLocalDate(row[0]);
            Long rowShopId = toLong(row[1]);
            String shopName = (String) row[2];
            String paymentMode = String.valueOf(row[3]);
            String status = String.valueOf(row[4]);
            long orders = toLong(row[5]);
            BigDecimal amount = toBigDecimal(row[6]);

            if (shopId != null && !shopId.equals(rowShopId))
                continue;
            // An inactive branch with orders in the period still has to be reconciled
            shopNames.putIfAbsent(rowShopId, shopName);

            Bucket branch = perBranch.computeIfAbsent(rowShopId, k -> new Bucket());
            Bucket day = perDay.computeIfAbsent(date, k -> new Bucket());

            if ("CANCELLED".equals(status)) {
                branch.addCancelled(orders, amount);
                day.addCancelled(orders, amount);
            } else if ("CASH".equals(paymentMode)) {
                branch.addCash(orders, amount);
                day.addCash(orders, amount);
                perSlot.computeIfAbsent(new Slot(rowShopId, date), k -> new Bucket()).addCash(orders, amount);
            } else {
                branch.addUpi(orders, amount);
                day.addUpi(orders, amount);
                perSlot.computeIfAbsent(new Slot(rowShopId, date), k -> new Bucket()).addUpi(orders, amount);
            }
        }

        // Shots and blends sold, grouped by day, branch and product category
        for (Object[] row : orderRepository.getUnitsSoldBreakdown(start, end, BusinessDay.startHour())) {
            LocalDate date = toLocalDate(row[0]);
            Long rowShopId = toLong(row[1]);
            String category = String.valueOf(row[2]);
            long quantity = toLong(row[3]);

            if (shopId != null && !shopId.equals(rowShopId))
                continue;
            if (!shopNames.containsKey(rowShopId))
                continue; // branch was dropped by the filter above

            boolean shot = "SHOT".equals(category);
            perBranch.computeIfAbsent(rowShopId, k -> new Bucket()).addUnits(shot, quantity);
            perDay.computeIfAbsent(date, k -> new Bucket()).addUnits(shot, quantity);
        }

        // What was actually received, against what the orders say, per branch-day
        Map<Slot, CollectionActual> actuals = new HashMap<>();
        for (CollectionActual actual : actualRepository.findByCollectionDateBetween(fromDate, toDate)) {
            Long actualShopId = actual.getShop().getId();
            if (shopNames.containsKey(actualShopId))
                actuals.put(new Slot(actualShopId, actual.getCollectionDate()), actual);
        }
        // A branch-day "needs" an entry when it took orders or already has one
        Set<Slot> slots = new HashSet<>(actuals.keySet());
        perSlot.forEach((slot, bucket) -> {
            if (bucket.cashOrders + bucket.upiOrders > 0)
                slots.add(slot);
        });
        for (Slot slot : slots) {
            Bucket expected = perSlot.getOrDefault(slot, new Bucket());
            CollectionActual actual = actuals.get(slot);
            Bucket branch = perBranch.computeIfAbsent(slot.shopId(), k -> new Bucket());
            Bucket day = perDay.computeIfAbsent(slot.date(), k -> new Bucket());
            branch.addSlot(expected, actual);
            day.addSlot(expected, actual);
        }

        List<CollectionRow> branches = new ArrayList<>();
        Bucket grand = new Bucket();
        for (Map.Entry<Long, Bucket> entry : perBranch.entrySet()) {
            Bucket bucket = entry.getValue();
            CollectionRow row = bucket.toRow(entry.getKey(), shopNames.get(entry.getKey()), null);
            // A branch row is one branch-day when the period is a single day
            if (fromDate.equals(toDate))
                attachEntry(row, actuals.get(new Slot(entry.getKey(), fromDate)));
            branches.add(row);
            grand.add(bucket);
        }
        branches.sort(Comparator.comparing(r -> r.getShopName() == null ? "" : r.getShopName(),
                String.CASE_INSENSITIVE_ORDER));

        List<CollectionRow> dayRows = new ArrayList<>();
        perDay.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> {
                    CollectionRow row = entry.getValue().toRow(null, null, entry.getKey());
                    // A day row is one branch-day when a single branch is selected
                    if (shopId != null)
                        attachEntry(row, actuals.get(new Slot(shopId, entry.getKey())));
                    dayRows.add(row);
                });

        return DailyCollectionResponse.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .branches(branches)
                .days(dayRows)
                .totals(grand.toRow(null, null, null))
                .build();
    }

    private static void attachEntry(CollectionRow row, CollectionActual actual) {
        row.setEditable(true);
        if (actual != null) {
            row.setActualNote(actual.getNote());
            row.setActualUpdatedBy(actual.getUpdatedBy());
            row.setActualUpdatedAt(actual.getUpdatedAt());
        }
    }

    private record Slot(Long shopId, LocalDate date) {
    }

    /** Running totals for one branch, one day, or the whole period. */
    private static class Bucket {
        private long shots;
        private long blends;
        private long cashOrders;
        private long upiOrders;
        private long cancelledOrders;
        private BigDecimal cashAmount = BigDecimal.ZERO;
        private BigDecimal upiAmount = BigDecimal.ZERO;
        private BigDecimal cancelledAmount = BigDecimal.ZERO;
        // Branch-days that took orders (or have an entry), and how many of them have an entry
        private long actualSlots;
        private long actualEntries;
        private BigDecimal actualCash = BigDecimal.ZERO;
        private BigDecimal actualUpi = BigDecimal.ZERO;
        private BigDecimal cashDifference = BigDecimal.ZERO;
        private BigDecimal upiDifference = BigDecimal.ZERO;

        // Differences only count branch-days with an entry, so a missing entry never reads as a shortfall
        void addSlot(Bucket expected, CollectionActual actual) {
            actualSlots++;
            if (actual == null)
                return;
            actualEntries++;
            actualCash = actualCash.add(actual.getActualCash());
            actualUpi = actualUpi.add(actual.getActualUpi());
            cashDifference = cashDifference.add(actual.getActualCash().subtract(expected.cashAmount));
            upiDifference = upiDifference.add(actual.getActualUpi().subtract(expected.upiAmount));
        }

        void addCash(long orders, BigDecimal amount) {
            cashOrders += orders;
            cashAmount = cashAmount.add(amount);
        }

        void addUpi(long orders, BigDecimal amount) {
            upiOrders += orders;
            upiAmount = upiAmount.add(amount);
        }

        void addCancelled(long orders, BigDecimal amount) {
            cancelledOrders += orders;
            cancelledAmount = cancelledAmount.add(amount);
        }

        void addUnits(boolean shot, long quantity) {
            if (shot)
                shots += quantity;
            else
                blends += quantity;
        }

        void add(Bucket other) {
            shots += other.shots;
            blends += other.blends;
            cashOrders += other.cashOrders;
            upiOrders += other.upiOrders;
            cancelledOrders += other.cancelledOrders;
            cashAmount = cashAmount.add(other.cashAmount);
            upiAmount = upiAmount.add(other.upiAmount);
            cancelledAmount = cancelledAmount.add(other.cancelledAmount);
            actualSlots += other.actualSlots;
            actualEntries += other.actualEntries;
            actualCash = actualCash.add(other.actualCash);
            actualUpi = actualUpi.add(other.actualUpi);
            cashDifference = cashDifference.add(other.cashDifference);
            upiDifference = upiDifference.add(other.upiDifference);
        }

        CollectionRow toRow(Long shopId, String shopName, LocalDate date) {
            return CollectionRow.builder()
                    .shopId(shopId)
                    .shopName(shopName)
                    .date(date)
                    .shots(shots)
                    .blends(blends)
                    .cashOrders(cashOrders)
                    .upiOrders(upiOrders)
                    .totalOrders(cashOrders + upiOrders)
                    .cashAmount(cashAmount)
                    .upiAmount(upiAmount)
                    .totalAmount(cashAmount.add(upiAmount))
                    .cancelledOrders(cancelledOrders)
                    .cancelledAmount(cancelledAmount)
                    .actualSlots(actualSlots)
                    .actualEntries(actualEntries)
                    .actualCash(actualEntries > 0 ? actualCash : null)
                    .actualUpi(actualEntries > 0 ? actualUpi : null)
                    .actualTotal(actualEntries > 0 ? actualCash.add(actualUpi) : null)
                    .cashDifference(actualEntries > 0 ? cashDifference : null)
                    .upiDifference(actualEntries > 0 ? upiDifference : null)
                    .difference(actualEntries > 0 ? cashDifference.add(upiDifference) : null)
                    .build();
        }
    }

    // Native queries hand back driver types, so normalise rather than cast blindly.

    private static LocalDate toLocalDate(Object value) {
        if (value instanceof LocalDate date)
            return date;
        if (value instanceof java.sql.Date date)
            return date.toLocalDate();
        if (value instanceof java.sql.Timestamp ts)
            return ts.toLocalDateTime().toLocalDate();
        if (value instanceof LocalDateTime dateTime)
            return dateTime.toLocalDate();
        return LocalDate.parse(String.valueOf(value));
    }

    private static long toLong(Object value) {
        if (value == null)
            return 0L;
        if (value instanceof Number number)
            return number.longValue();
        return Long.parseLong(String.valueOf(value));
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null)
            return BigDecimal.ZERO;
        if (value instanceof BigDecimal decimal)
            return decimal;
        if (value instanceof Number number)
            return new BigDecimal(number.toString());
        return new BigDecimal(String.valueOf(value));
    }
}
