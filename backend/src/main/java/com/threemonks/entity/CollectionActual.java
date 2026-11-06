package com.threemonks.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * What a branch actually received on a day, entered by an admin, so it can be
 * compared with what the orders say it should have received. One row per
 * branch per day; entering it again updates the same row.
 */
@Entity
@Table(name = "collection_actuals",
        uniqueConstraints = @UniqueConstraint(columnNames = {"shop_id", "collection_date"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CollectionActual {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shop_id", nullable = false)
    private Shop shop;

    @Column(name = "collection_date", nullable = false)
    private LocalDate collectionDate;

    @Column(name = "actual_cash", nullable = false, precision = 12, scale = 2)
    private BigDecimal actualCash;

    @Column(name = "actual_upi", nullable = false, precision = 12, scale = 2)
    private BigDecimal actualUpi;

    @Column(length = 500)
    private String note;

    /** Username of the admin who last saved it. */
    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
