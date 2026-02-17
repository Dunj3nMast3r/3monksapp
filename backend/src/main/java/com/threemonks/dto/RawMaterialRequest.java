package com.threemonks.dto;

import com.threemonks.enums.UnitType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RawMaterialRequest {
    @NotBlank(message = "Name is required")
    private String name;

    @NotNull(message = "Unit type is required")
    private UnitType unitType;

    @NotNull(message = "Cost per unit is required")
    private BigDecimal costPerUnit;

    private String vendorName;
    private String vendorContact;
    private BigDecimal reorderLevel;
    private LocalDate expiryDate;
}
