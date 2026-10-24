package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** Current stock for one shop. Built per shop so the report can cover all of them. */
@Data
@Builder
public class ShopStockReportResponse {
    private Long shopId;
    private String shopName;
    private List<StockResponse> items;
    private long lowStockCount;
}
