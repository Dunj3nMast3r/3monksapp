package com.threemonks.dto;

import com.threemonks.enums.StockTransactionType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * One screenful of stock entries saved together: every material the user filled
 * in, for a single shop and a single movement type. Applied atomically — if one
 * line is rejected, none of them are written.
 */
@Data
public class BulkStockEntryRequest {

    @NotNull(message = "Shop ID is required")
    private Long shopId;

    @NotNull(message = "Entry type is required")
    private StockTransactionType type;

    @NotEmpty(message = "At least one line is required")
    @Valid
    private List<Line> lines;

    @Data
    public static class Line {
        @NotNull(message = "Raw material ID is required")
        private Long rawMaterialId;

        /**
         * For PURCHASE and CONSUMPTION this is the quantity moved. For ADJUSTMENT
         * it is the actual physical count the balance should be set to.
         */
        @NotNull(message = "Quantity is required")
        @DecimalMin(value = "0.00", message = "Quantity cannot be negative")
        private BigDecimal quantity;

        /** Business date for this line. Defaults to today when omitted. */
        private LocalDate txnDate;

        private String notes;
    }
}
