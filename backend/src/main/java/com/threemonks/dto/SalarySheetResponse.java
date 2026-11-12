package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class SalarySheetResponse {
    private Long employeeId;
    private String fullName;
    private String shopName;
    private BigDecimal baseSalary;
    private BigDecimal incentivePercentage;
    private BigDecimal totalSalesHandled;
    private Long totalOrders;
    private BigDecimal incentiveAmount;
    /** Staff sales incentive (units sold above the branch's daily free units, by attendance). */
    private BigDecimal salesIncentive;
    private BigDecimal totalPay;
    private String month;

    @Data
    @Builder
    public static class MonthlySummary {
        private String month;
        private List<SalarySheetResponse> employees;
        private BigDecimal totalSalaries;
        private BigDecimal totalIncentives;
        private BigDecimal totalSalesIncentives;
        private BigDecimal grandTotal;
    }
}
