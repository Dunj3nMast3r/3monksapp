package com.threemonks.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** The cash and UPI a branch actually received on a day. */
@Data
public class CollectionActualRequest {
    @NotNull(message = "Branch is required")
    private Long shopId;

    @NotNull(message = "Date is required")
    private LocalDate date;

    @NotNull(message = "Actual cash is required")
    @DecimalMin(value = "0", message = "Actual cash cannot be negative")
    @Digits(integer = 10, fraction = 2, message = "Actual cash can have at most 2 decimals")
    private BigDecimal actualCash;

    @NotNull(message = "Actual UPI is required")
    @DecimalMin(value = "0", message = "Actual UPI cannot be negative")
    @Digits(integer = 10, fraction = 2, message = "Actual UPI can have at most 2 decimals")
    private BigDecimal actualUpi;

    @Size(max = 500, message = "Note can be at most 500 characters")
    private String note;
}
