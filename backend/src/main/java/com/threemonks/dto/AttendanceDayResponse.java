package com.threemonks.dto;

import com.threemonks.enums.AttendanceStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** The register for one branch and day: every employee, marked or not. */
@Data
@Builder
public class AttendanceDayResponse {
    private Long shopId;
    private String shopName;
    private LocalDate date;
    private List<Row> employees;

    @Data
    @Builder
    public static class Row {
        private Long employeeId;
        private String name;
        private String role;
        /** Null when the day isn't marked for this employee. */
        private AttendanceStatus status;
        private String note;
        private String markedBy;
        private LocalDateTime markedAt;
        /** False for someone no longer working here who still has a mark that day. */
        private boolean active;
    }
}
