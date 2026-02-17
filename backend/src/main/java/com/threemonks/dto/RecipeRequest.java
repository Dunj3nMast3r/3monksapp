package com.threemonks.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class RecipeRequest {
    @NotNull(message = "Product ID is required")
    private Long productId;

    @NotNull(message = "Raw material ID is required")
    private Long rawMaterialId;

    @NotNull(message = "Quantity required is required")
    private BigDecimal quantityRequired;
}
