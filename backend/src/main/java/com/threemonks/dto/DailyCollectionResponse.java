package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Day-end reconciliation figures: how many shots and blends went out and how
 * much was taken in cash and on UPI, broken down per branch and per day.
 */
@Data
@Builder
public class DailyCollectionResponse {

    private LocalDate fromDate;
    private LocalDate toDate;

    /** Every branch in the period, including branches that took nothing. */
    private List<CollectionRow> branches;

    /** One row per calendar day in the period, summed over the branches shown. */
    private List<CollectionRow> days;

    /** The whole period summed over the branches shown. */
    private CollectionRow totals;

    /**
     * One reconciliation line. {@code shopId}/{@code shopName} are set on branch
     * rows, {@code date} on day rows, and neither on the totals row.
     */
    @Data
    @Builder
    public static class CollectionRow {
        private Long shopId;
        private String shopName;
        private LocalDate date;

        /** Units sold, not orders: SHOT products vs CREAMY_BLEND + CURATED_BLEND. */
        private Long shots;
        private Long blends;

        private Long cashOrders;
        private Long upiOrders;
        private Long totalOrders;

        /**
         * Sales entered by hand for manual-sales branches (shots × price + blends × price),
         * already included in totalAmount, shots and blends. Null when there are none.
         */
        private BigDecimal manualAmount;
        /** True when the row includes hand-entered days (cash/UPI split is then not known for them). */
        private boolean manual;

        /** Amounts include the parcel charge, i.e. what the customer actually paid. */
        private BigDecimal cashAmount;
        private BigDecimal upiAmount;
        private BigDecimal totalAmount;

        /** Cancelled orders are excluded from every figure above and reported here. */
        private Long cancelledOrders;
        private BigDecimal cancelledAmount;

        /**
         * What was actually received, as entered by an admin. {@code actualSlots} is
         * the number of branch-days in this row that took orders (or have an entry),
         * {@code actualEntries} how many of them have an entry. Amounts and
         * differences (actual − expected) cover only the entered branch-days and are
         * null when none is entered.
         */
        private Long actualSlots;
        private Long actualEntries;
        private BigDecimal actualCash;
        private BigDecimal actualUpi;
        private BigDecimal actualTotal;
        private BigDecimal cashDifference;
        private BigDecimal upiDifference;
        private BigDecimal difference;

        /** Set on rows that are exactly one branch on one day, which is where an entry is made. */
        private boolean editable;
        private String actualNote;
        private String actualUpdatedBy;
        private LocalDateTime actualUpdatedAt;
    }
}
