package com.threemonks.entity;

import com.threemonks.enums.StockTransactionType;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One day's stock movement of a given type, for one material in one shop.
 *
 * There is at most one row per (shop, material, txn_date, txn_type): entering
 * the same material again for the same date updates that row rather than
 * adding another, so a day always reads as a single figure. Stock is managed
 * manually — nothing in the ordering flow writes here.
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

    /**
     * The day's running total for this type: positive for a purchase, negative
     * for consumption, either way for an adjustment. Repeat entries for the same
     * date accumulate here.
     */
    @Column(name = "quantity_change", nullable = false, precision = 10, scale = 2)
    private BigDecimal quantityChange;

    /** Only set for ADJUSTMENT — the latest physical count entered for the day. */
    @Column(name = "actual_count", precision = 10, scale = 2)
    private BigDecimal actualCount;

    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /** When the row was first entered, as opposed to the business date it applies to. */
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    /** When the day's figure was last changed. */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
