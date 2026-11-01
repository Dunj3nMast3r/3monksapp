package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
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

        /** Amounts include the parcel charge, i.e. what the customer actually paid. */
        private BigDecimal cashAmount;
        private BigDecimal upiAmount;
        private BigDecimal totalAmount;

        /** Cancelled orders are excluded from every figure above and reported here. */
        private Long cancelledOrders;
        private BigDecimal cancelledAmount;
    }
}
