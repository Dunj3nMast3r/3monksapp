package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** One page of Order History. */
@Data
@Builder
public class OrderPageResponse {
    private List<OrderResponse> orders;
    /** Page number, from 0. */
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
}
