package com.threemonks.dto;

import com.threemonks.enums.AttendanceStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/** The register for one branch and day: each employee's status (null = clear the mark). */
@Data
public class AttendanceRequest {
    @NotNull(message = "Branch is required")
    private Long shopId;

    @NotNull(message = "Date is required")
    private LocalDate date;

    @NotEmpty(message = "Nothing to save")
    @Valid
    private List<Entry> entries;

    @Data
    public static class Entry {
        @NotNull(message = "Employee is required")
        private Long employeeId;

        /** Null removes the day's mark (back to "not marked"). */
        private AttendanceStatus status;

        @Size(max = 300, message = "Note can be at most 300 characters")
        private String note;
    }
}
