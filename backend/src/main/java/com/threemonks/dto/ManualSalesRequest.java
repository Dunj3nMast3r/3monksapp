package com.threemonks.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day's hand-entered sales at a manual-sales branch, with the amount received. */
@Data
public class ManualSalesRequest {
    @NotNull(message = "Branch is required")
    private Long shopId;

    @NotNull(message = "Date is required")
    private LocalDate date;

    @NotNull(message = "Shots sold is required")
    @Min(value = 0, message = "Shots cannot be negative")
    @Max(value = 100000, message = "Shots looks too high")
    private Integer shots;

    @NotNull(message = "Blends sold is required")
    @Min(value = 0, message = "Blends cannot be negative")
    @Max(value = 100000, message = "Blends looks too high")
    private Integer blends;

    @NotNull(message = "Cash received is required (0 if none)")
    @DecimalMin(value = "0", message = "Cash received cannot be negative")
    @Digits(integer = 10, fraction = 2, message = "Cash received can have at most 2 decimals")
    private BigDecimal receivedCash;

    @NotNull(message = "UPI received is required (0 if none)")
    @DecimalMin(value = "0", message = "UPI received cannot be negative")
    @Digits(integer = 10, fraction = 2, message = "UPI received can have at most 2 decimals")
    private BigDecimal receivedUpi;

    @Size(max = 500, message = "Note can be at most 500 characters")
    private String note;
}
