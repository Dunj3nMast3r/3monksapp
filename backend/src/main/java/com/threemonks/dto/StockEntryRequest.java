package com.threemonks.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** A purchase or a consumption entry. Quantity is always positive — the type decides the sign. */
@Data
public class StockEntryRequest {
    @NotNull(message = "Shop ID is required")
    private Long shopId;

    @NotNull(message = "Raw material ID is required")
    private Long rawMaterialId;

    @NotNull(message = "Quantity is required")
    @DecimalMin(value = "0.01", message = "Quantity must be greater than zero")
    private BigDecimal quantity;

    /** Business date. Defaults to today when omitted; may be in the past. */
    private LocalDate txnDate;

    private BigDecimal minimumThreshold;
    private String notes;
}
