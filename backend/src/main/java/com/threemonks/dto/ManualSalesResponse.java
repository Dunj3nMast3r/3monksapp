package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Manual Sales Entry page: a manual-sales branch's entries for a period. */
@Data
@Builder
public class ManualSalesResponse {
    private Long shopId;
    private String shopName;
    private BigDecimal shotPrice;
    private BigDecimal blendPrice;
    /** The branch's incentive rule, when on: free units per day, ₹ per unit above, first day. */
    private Integer incentiveFreeUnits;
    private BigDecimal incentivePerUnit;
    private LocalDate incentiveStartDate;
    private List<Day> days;
    private Day totals;

    @Data
    @Builder
    public static class Day {
        private LocalDate date;
        private Integer shots;
        private Integer blends;
        private BigDecimal shotPrice;
        private BigDecimal blendPrice;
        private BigDecimal amount;
        private BigDecimal receivedCash;
        private BigDecimal receivedUpi;
        private BigDecimal receivedTotal;
        /** received − amount; null when nothing received was entered */
        private BigDecimal difference;
        private String note;
        /** Incentive per operator present that day (half for a half day); null when it doesn't apply. */
        private BigDecimal incentivePerPerson;
        /** The admin's override, when set. */
        private BigDecimal incentiveOverride;
        private String updatedBy;
        private LocalDateTime updatedAt;
    }
}
