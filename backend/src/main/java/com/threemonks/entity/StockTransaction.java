package com.threemonks.entity;

import com.threemonks.enums.StockTransactionType;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One stock movement. Stock is managed manually — nothing in the ordering
 * flow writes here. Every change to a Stock balance has a row in this table.
 */
@Entity
@Table(name = "stock_transactions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class StockTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shop_id", nullable = false)
    private Shop shop;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "raw_material_id", nullable = false)
    private RawMaterial rawMaterial;

    /** Business date the movement belongs to — user-selectable, may be backdated. */
    @Column(name = "txn_date", nullable = false)
    private LocalDate txnDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "txn_type", nullable = false)
    private StockTransactionType txnType;

    /** Signed: positive for a purchase, negative for consumption, either way for an adjustment. */
    @Column(name = "quantity_change", nullable = false, precision = 10, scale = 2)
    private BigDecimal quantityChange;

    /** Only set for ADJUSTMENT — the physical count that was entered. */
    @Column(name = "actual_count", precision = 10, scale = 2)
    private BigDecimal actualCount;

    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /** When the row was entered, as opposed to the business date it applies to. */
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
