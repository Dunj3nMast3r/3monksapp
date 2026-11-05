package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

// One material's movement over a date range: opening + received - used + corrected = closing
@Data
@Builder
public class StockReportResponse {
    private Long rawMaterialId;
    private String rawMaterialName;
    private String unitType;
    private BigDecimal opening;
    private BigDecimal received;
    private BigDecimal used;
    // Net effect of Correct Count entries (can be negative)
    private BigDecimal corrected;
    private BigDecimal closing;
}
