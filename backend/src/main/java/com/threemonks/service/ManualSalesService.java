package com.threemonks.service;

import com.threemonks.dto.CollectionActualRequest;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

    private final ManualDailySalesRepository manualRepository;
    private final CollectionActualRepository actualRepository;
    private final ShopRepository shopRepository;
    private final CollectionService collectionService;

    // ---------- Manual Sales Entry page ----------

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
                    .note(m.getNote() != null ? m.getNote() : a == null ? null : a.getNote())
                    .incentivePerPerson(IncentiveService.perPerson(shop, m.getSalesDate(),
                            (long) m.getShots() + m.getBlends(), m.getIncentiveOverride()))
                    .incentiveOverride(m.getIncentiveOverride())
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
                .incentiveFreeUnits(shop.isIncentiveOn() ? shop.getIncentiveFreeUnits() : null)
                .incentivePerUnit(shop.isIncentiveOn() ? shop.getIncentivePerUnit() : null)
                .incentiveStartDate(shop.isIncentiveOn() ? shop.getIncentiveStartDate() : null)
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
        // Received is optional: both empty = not known (yet); one empty with the other filled = ₹0
        upsert(shop, request.getDate(), request.getShots(), request.getBlends(),
                request.getReceivedCash(), request.getReceivedUpi(), request.getNote(), user.getUsername());
        // The incentive override is the admin's call: empty = use the rule. A manager's save keeps it as is.
        if (user.getRole() == Role.SUPER_ADMIN) {
            manualRepository.findByShopIdAndSalesDate(shop.getId(), request.getDate()).ifPresent(m -> {
                m.setIncentiveOverride(request.getIncentiveOverride());
                manualRepository.save(m);
            });
        }
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
     * Saves a day; returns true when it already existed. Past days keep the prices they
     * were entered with. Received: both null = not entered (no difference is worked out,
     * and an earlier amount is removed); one null with the other set = ₹0.
     */
    boolean upsert(Shop shop, LocalDate date, int shots, int blends, BigDecimal cash, BigDecimal upi,
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
        String trimmedNote = note == null ? "" : note.trim();
        entry.setNote(trimmedNote.isEmpty() ? null : trimmedNote);
        entry.setUpdatedBy(username);
        entry.setUpdatedAt(LocalDateTime.now(BusinessDay.ZONE));
        manualRepository.save(entry);

        if (cash == null && upi == null) {
            actualRepository.findByShopIdAndCollectionDate(shop.getId(), date).ifPresent(actualRepository::delete);
            return existing.isPresent();
        }
        CollectionActualRequest received = new CollectionActualRequest();
        received.setShopId(shop.getId());
        received.setDate(date);
        received.setActualCash(cash != null ? cash : BigDecimal.ZERO);
        received.setActualUpi(upi != null ? upi : BigDecimal.ZERO);
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
            throw new BadRequestException(shop.getName() + " takes orders in the app; Manual Sales Entry is only for branches that take orders by hand");
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
}
