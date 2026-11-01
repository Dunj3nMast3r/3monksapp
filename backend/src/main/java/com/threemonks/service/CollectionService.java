package com.threemonks.service;

import com.threemonks.dto.DailyCollectionResponse;
import com.threemonks.dto.DailyCollectionResponse.CollectionRow;
import com.threemonks.entity.Shop;
import com.threemonks.exception.BadRequestException;
import com.threemonks.repository.OrderRepository;
import com.threemonks.repository.ShopRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Day-end reconciliation: units sold and cash/UPI taken, per branch and per day.
 *
 * <p>Collection is counted on every order that was not cancelled, including
 * orders still PENDING at the counter, because payment is taken when the order
 * is placed rather than when the stations hand it over. Cancelled orders are
 * reported separately so the till can be explained, never mixed into the
 * collected totals.
 */
@Service
@RequiredArgsConstructor
public class CollectionService {

    /** Guard against someone asking for years of days in one response. */
    private static final int MAX_DAYS = 92;

    private final OrderRepository orderRepository;
    private final ShopRepository shopRepository;

    public DailyCollectionResponse getDailyCollection(LocalDate fromDate, LocalDate toDate, Long shopId) {
        if (fromDate == null)
            fromDate = LocalDate.now();
        if (toDate == null)
            toDate = fromDate;
        if (toDate.isBefore(fromDate))
            throw new BadRequestException("'to' date cannot be before 'from' date");

        long days = ChronoUnit.DAYS.between(fromDate, toDate) + 1;
        if (days > MAX_DAYS)
            throw new BadRequestException("Date range cannot exceed " + MAX_DAYS + " days");

        LocalDateTime start = fromDate.atStartOfDay();
        LocalDateTime end = toDate.atTime(LocalTime.MAX);

        // Branch names for every branch we may report, active ones included even
        // when they sold nothing, so a missing branch reads as zero and not as absent.
        Map<Long, String> shopNames = new LinkedHashMap<>();
        for (Shop shop : shopRepository.findByActiveTrue()) {
            if (shopId == null || shopId.equals(shop.getId()))
                shopNames.put(shop.getId(), shop.getName());
        }

        Map<Long, Bucket> perBranch = new LinkedHashMap<>();
        Map<LocalDate, Bucket> perDay = new LinkedHashMap<>();
        for (Long id : shopNames.keySet())
            perBranch.put(id, new Bucket());
        for (LocalDate d = fromDate; !d.isAfter(toDate); d = d.plusDays(1))
            perDay.put(d, new Bucket());

        // Cash / UPI / cancelled, grouped by day, branch, payment mode and status
        for (Object[] row : orderRepository.getCollectionBreakdown(start, end)) {
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
            } else {
                branch.addUpi(orders, amount);
                day.addUpi(orders, amount);
            }
        }

        // Shots and blends sold, grouped by day, branch and product category
        for (Object[] row : orderRepository.getUnitsSoldBreakdown(start, end)) {
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

        List<CollectionRow> branches = new ArrayList<>();
        Bucket grand = new Bucket();
        for (Map.Entry<Long, Bucket> entry : perBranch.entrySet()) {
            Bucket bucket = entry.getValue();
            branches.add(bucket.toRow(entry.getKey(), shopNames.get(entry.getKey()), null));
            grand.add(bucket);
        }
        branches.sort(Comparator.comparing(r -> r.getShopName() == null ? "" : r.getShopName(),
                String.CASE_INSENSITIVE_ORDER));

        List<CollectionRow> dayRows = new ArrayList<>();
        perDay.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> dayRows.add(entry.getValue().toRow(null, null, entry.getKey())));

        return DailyCollectionResponse.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .branches(branches)
                .days(dayRows)
                .totals(grand.toRow(null, null, null))
                .build();
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
