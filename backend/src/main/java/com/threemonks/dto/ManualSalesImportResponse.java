package com.threemonks.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** Result of a sheet import: nothing is saved when there are errors. */
@Data
@Builder
public class ManualSalesImportResponse {
    private int created;
    private int updated;
    private List<String> errors;
}
