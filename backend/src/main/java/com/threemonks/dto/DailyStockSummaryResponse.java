package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One material on one day, with however many entries were made that day rolled up. */
@Data
@Builder
public class DailyStockSummaryResponse {
    private LocalDate txnDate;
    private Long rawMaterialId;
    private String rawMaterialName;
    private String unitType;
    private BigDecimal purchased;
    private BigDecimal consumed;
    private BigDecimal adjusted;
}
