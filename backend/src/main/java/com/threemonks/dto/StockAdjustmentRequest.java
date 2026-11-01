package com.threemonks.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Correction from a physical count. The user enters what is actually on the
 * shelf; the service works out the delta and stores both.
 */
@Data
public class StockAdjustmentRequest {
    @NotNull(message = "Shop ID is required")
    private Long shopId;

    @NotNull(message = "Raw material ID is required")
    private Long rawMaterialId;

    @NotNull(message = "Actual count is required")
    @DecimalMin(value = "0.00", message = "Actual count cannot be negative")
    private BigDecimal actualCount;

    /** Business date. Defaults to today when omitted; may be in the past. */
    private LocalDate txnDate;

    private String notes;
}
