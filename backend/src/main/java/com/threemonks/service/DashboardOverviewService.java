package com.threemonks.service;

import com.threemonks.dto.DailyCollectionResponse;
import com.threemonks.dto.DashboardOverviewResponse;
import com.threemonks.dto.DashboardOverviewResponse.*;
import com.threemonks.repository.OrderItemRepository;
import com.threemonks.repository.OrderRepository;
import com.threemonks.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the admin dashboard: today first, then when the rush lands, what is
 * selling and how the branches compare.
 *
 * <p>Counts orders that were not cancelled, PENDING ones included, so the
 * dashboard and the daily collection widget never disagree about what a day
 * took in. See {@link DashboardOverviewResponse} for why.
 */
@Service
@RequiredArgsConstructor
public class DashboardOverviewService {

    /** Days of history behind the peak-hours chart. */
    private static final int PEAK_HOUR_DAYS = 7;
    /** Days on the sales trend line. */
    private static final int TREND_DAYS = 30;
    /** Months on the monthly bar chart. */
    private static final int TREND_MONTHS = 12;

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final StockRepository stockRepository;
    private final CollectionService collectionService;

    public DashboardOverviewResponse getOverview(LocalDate today) {
        if (today == null)
            today = LocalDate.now();

        // One pass over the longest window any panel needs, then slice it up in
        // memory rather than asking the database the same question twelve times.
        LocalDate windowStart = YearMonth.from(today).minusMonths(TREND_MONTHS - 1L).atDay(1);
        LocalDate previousMonthStart = today.minusMonths(1).withDayOfMonth(1);
        if (previousMonthStart.isBefore(windowStart))
            windowStart = previousMonthStart;

        Map<LocalDate, DayTotals> byDate = loadDailyTotals(windowStart, today);

        LocalDate yesterday = today.minusDays(1);
        LocalDate monthStart = today.withDayOfMonth(1);

        // The same stretch of last month, clamped so the 31st does not fall off a
        // 30-day month and quietly compare against nothing.
        LocalDate prevMonthStart = monthStart.minusMonths(1);
        int dayOfMonth = Math.min(today.getDayOfMonth(), prevMonthStart.lengthOfMonth());
        LocalDate prevMonthEnd = prevMonthStart.withDayOfMonth(dayOfMonth);

        return DashboardOverviewResponse.builder()
                .date(today)
                .today(sum(byDate, today, today))
                .yesterday(sum(byDate, yesterday, yesterday))
                .monthToDate(sum(byDate, monthStart, today))
                .previousMonthToDate(sum(byDate, prevMonthStart, prevMonthEnd))
                .peakHours(getPeakHours(today))
                .peakHourDays(PEAK_HOUR_DAYS)
                .dailyTrend(getDailyTrend(byDate, today))
                .monthlyTrend(getMonthlyTrend(byDate, today))
                .topSellersToday(getTopSellersToday(today))
                .branchesToday(getBranchesToday(today))
                .lowStockAlerts(getLowStockAlerts())
                .build();
    }

    /** Orders, amount and units for every day in the window that saw any. */
    private Map<LocalDate, DayTotals> loadDailyTotals(LocalDate from, LocalDate to) {
        LocalDateTime start = from.atStartOfDay();
        LocalDateTime end = to.atTime(LocalTime.MAX);

        Map<LocalDate, DayTotals> byDate = new HashMap<>();
        for (Object[] row : orderRepository.getDailyTotals(start, end)) {
            DayTotals totals = byDate.computeIfAbsent(Convert.toLocalDate(row[0]), k -> new DayTotals());
            totals.orders += Convert.toLong(row[1]);
            totals.sales = totals.sales.add(Convert.toBigDecimal(row[2]));
        }
        for (Object[] row : orderRepository.getDailyUnits(start, end)) {
            byDate.computeIfAbsent(Convert.toLocalDate(row[0]), k -> new DayTotals()).units += Convert.toLong(row[1]);
        }
        return byDate;
    }

    private PeriodStats sum(Map<LocalDate, DayTotals> byDate, LocalDate from, LocalDate to) {
        DayTotals total = new DayTotals();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DayTotals day = byDate.get(d);
            if (day == null)
                continue;
            total.orders += day.orders;
            total.units += day.units;
            total.sales = total.sales.add(day.sales);
        }
        return PeriodStats.builder()
                .sales(total.sales)
                .orders(total.orders)
                .units(total.units)
                .averageOrderValue(average(total.sales, total.orders))
                .build();
    }

    private List<HourStats> getPeakHours(LocalDate today) {
        LocalDateTime start = today.minusDays(PEAK_HOUR_DAYS - 1L).atStartOfDay();
        LocalDateTime end = today.atTime(LocalTime.MAX);

        Map<Integer, HourTotals> byHour = new HashMap<>();
        for (Object[] row : orderRepository.getHourlyTotals(start, end)) {
            HourTotals totals = byHour.computeIfAbsent((int) Convert.toLong(row[0]), k -> new HourTotals());
            totals.orders += Convert.toLong(row[1]);
            totals.sales = totals.sales.add(Convert.toBigDecimal(row[2]));
        }

        // Every hour is reported, including the closed ones, so the chart keeps a
        // steady shape instead of redrawing its axis as trade moves around.
        List<HourStats> hours = new ArrayList<>(24);
        for (int hour = 0; hour < 24; hour++) {
            HourTotals totals = byHour.getOrDefault(hour, new HourTotals());
            hours.add(HourStats.builder()
                    .hour(hour)
                    .sales(totals.sales)
                    .orders(totals.orders)
                    .build());
        }
        return hours;
    }

    private List<DayStats> getDailyTrend(Map<LocalDate, DayTotals> byDate, LocalDate today) {
        List<DayStats> trend = new ArrayList<>(TREND_DAYS);
        for (LocalDate d = today.minusDays(TREND_DAYS - 1L); !d.isAfter(today); d = d.plusDays(1)) {
            DayTotals totals = byDate.getOrDefault(d, new DayTotals());
            trend.add(DayStats.builder()
                    .date(d)
                    .sales(totals.sales)
                    .orders(totals.orders)
                    .build());
        }
        return trend;
    }

    private List<MonthStats> getMonthlyTrend(Map<LocalDate, DayTotals> byDate, LocalDate today) {
        Map<YearMonth, DayTotals> byMonth = new HashMap<>();
        byDate.forEach((date, totals) -> {
            DayTotals month = byMonth.computeIfAbsent(YearMonth.from(date), k -> new DayTotals());
            month.orders += totals.orders;
            month.units += totals.units;
            month.sales = month.sales.add(totals.sales);
        });

        List<MonthStats> trend = new ArrayList<>(TREND_MONTHS);
        YearMonth current = YearMonth.from(today).minusMonths(TREND_MONTHS - 1L);
        YearMonth last = YearMonth.from(today);
        while (!current.isAfter(last)) {
            DayTotals totals = byMonth.getOrDefault(current, new DayTotals());
            trend.add(MonthStats.builder()
                    .month(current.toString())
                    .sales(totals.sales)
                    .orders(totals.orders)
                    .build());
            current = current.plusMonths(1);
        }
        return trend;
    }

    private List<ProductStats> getTopSellersToday(LocalDate today) {
        return orderItemRepository
                .getTopProductsExcludingCancelled(today.atStartOfDay(), today.atTime(LocalTime.MAX)).stream()
                .limit(8)
                .map(row -> ProductStats.builder()
                        .productName((String) row[0])
                        .quantity(Convert.toLong(row[1]))
                        .revenue(Convert.toBigDecimal(row[2]))
                        .build())
                .toList();
    }

    /** Reuses the collection figures so the leaderboard and the till agree exactly. */
    private List<BranchStats> getBranchesToday(LocalDate today) {
        DailyCollectionResponse collection = collectionService.getDailyCollection(today, today, null);
        return collection.getBranches().stream()
                .map(branch -> BranchStats.builder()
                        .shopId(branch.getShopId())
                        .shopName(branch.getShopName())
                        .sales(branch.getTotalAmount())
                        .orders(branch.getTotalOrders())
                        .shots(branch.getShots())
                        .blends(branch.getBlends())
                        .averageOrderValue(average(branch.getTotalAmount(), branch.getTotalOrders()))
                        .build())
                .sorted((a, b) -> b.getSales().compareTo(a.getSales()))
                .toList();
    }

    private List<LowStockAlert> getLowStockAlerts() {
        return stockRepository.findAllLowStock().stream()
                .map(stock -> LowStockAlert.builder()
                        .shopId(stock.getShop().getId())
                        .shopName(stock.getShop().getName())
                        .rawMaterialName(stock.getRawMaterial().getName())
                        .currentQuantity(stock.getQuantity())
                        .threshold(stock.getMinimumThreshold())
                        .build())
                .toList();
    }

    private static BigDecimal average(BigDecimal total, long count) {
        if (count <= 0)
            return BigDecimal.ZERO;
        return total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }

    private static class DayTotals {
        private long orders;
        private long units;
        private BigDecimal sales = BigDecimal.ZERO;
    }

    private static class HourTotals {
        private long orders;
        private BigDecimal sales = BigDecimal.ZERO;
    }

    /** Native queries hand back driver types, so normalise rather than cast blindly. */
    private static final class Convert {
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
}
