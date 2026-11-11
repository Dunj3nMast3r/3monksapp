package com.threemonks.dto;

import com.threemonks.enums.AttendanceStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** A branch's month: per employee, the count of each status and the day-by-day marks. */
@Data
@Builder
public class AttendanceMonthResponse {
    private Long shopId;
    private String shopName;
    private String month;
    private LocalDate from;
    private LocalDate to;
    /** Days of the month up to today (business day), the ones that should be marked. */
    private int daysSoFar;
    private List<Row> employees;
    /** The branch's paid leaves per month; null when not tracked. */
    private java.math.BigDecimal monthlyLeaves;

    @Data
    @Builder
    public static class Row {
        private Long employeeId;
        private String name;
        private String role;
        private int present;
        private int halfDay;
        private int leave;
        private int absent;
        private int weekOff;
        /**
         * First day a mark is expected (the later of the 1st and the day they joined);
         * null when they no longer work here, so no day counts as missing.
         */
        private LocalDate markFrom;
        /** Days up to today with no mark. */
        private int notMarked;
        /** Carried in, allocated, used, balance left and extra for the month; null when not tracked. */
        private com.threemonks.service.LeaveBalanceService.MonthLeave leaveBalance;
        /** Marked day → status ("2026-11-03" → PRESENT). */
        private Map<LocalDate, AttendanceStatus> days;
    }
}
