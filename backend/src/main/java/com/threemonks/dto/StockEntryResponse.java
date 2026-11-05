package com.threemonks.dto;

import com.threemonks.enums.StockTransactionType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

// A recorded day figure for one material and type, as listed for review or removal
@Data
@Builder
public class StockEntryResponse {
    private Long id;
    private Long rawMaterialId;
    private String rawMaterialName;
    private String unitType;
    private StockTransactionType type;
    private LocalDate txnDate;
    // What was entered: received or used amount, or the counted figure for a correction
    private BigDecimal quantity;
    // Effect on the balance (signed); removing the entry reverses it
    private BigDecimal balanceChange;
    private String enteredBy;
    private LocalDateTime updatedAt;
    // Whether it is still recent enough to be removed
    private boolean removable;
}
