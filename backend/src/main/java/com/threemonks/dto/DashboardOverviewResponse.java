package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The counter-facing view of the business: what sold today, when the rush lands,
 * what is selling, and how the branches compare.
 *
 * <p>Every figure here counts orders that were not cancelled, PENDING ones
 * included, because payment is taken when the order is placed. That matches the
 * daily collection widget. The Reports page and /profit-loss still count
 * COMPLETED orders only, so their revenue reads lower.
 */
@Data
@Builder
public class DashboardOverviewResponse {

    /** The day treated as "today", so the client and server cannot disagree. */
    private LocalDate date;

    private PeriodStats today;
    private PeriodStats yesterday;
    private PeriodStats monthToDate;

    /** The same stretch of last month, so month-to-date compares like with like. */
    private PeriodStats previousMonthToDate;

    /** Sales by hour of day over {@code peakHourDays} days ending today. */
    private List<HourStats> peakHours;
    private int peakHourDays;

    private List<DayStats> dailyTrend;
    private List<MonthStats> monthlyTrend;
    private List<ProductStats> topSellersToday;
    private List<BranchStats> branchesToday;
    private List<LowStockAlert> lowStockAlerts;

    @Data
    @Builder
    public static class PeriodStats {
        private BigDecimal sales;
        private Long orders;
        /** Items sold, not orders. */
        private Long units;
        private BigDecimal averageOrderValue;
    }

    @Data
    @Builder
    public static class HourStats {
        /** Hour of day, 0-23, in the shop's own time. */
        private int hour;
        private BigDecimal sales;
        private Long orders;
    }

    @Data
    @Builder
    public static class DayStats {
        private LocalDate date;
        private BigDecimal sales;
        private Long orders;
    }

    @Data
    @Builder
    public static class MonthStats {
        /** ISO year-month, e.g. 2026-11. */
        private String month;
        private BigDecimal sales;
        private Long orders;
    }

    @Data
    @Builder
    public static class ProductStats {
        private String productName;
        private Long quantity;
        private BigDecimal revenue;
    }

    @Data
    @Builder
    public static class LowStockAlert {
        private Long shopId;
        private String shopName;
        private String rawMaterialName;
        private BigDecimal currentQuantity;
        private BigDecimal threshold;
    }

    @Data
    @Builder
    public static class BranchStats {
        private Long shopId;
        private String shopName;
        private BigDecimal sales;
        private Long orders;
        private Long shots;
        private Long blends;
        private BigDecimal averageOrderValue;
    }
}
