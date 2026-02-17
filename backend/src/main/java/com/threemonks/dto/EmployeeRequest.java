package com.threemonks.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class EmployeeRequest {
    @NotNull(message = "User ID is required")
    private Long userId;

    @NotNull(message = "Shop ID is required")
    private Long shopId;

    @NotNull(message = "Salary is required")
    private BigDecimal salary;

    private BigDecimal incentivePercentage;
}
