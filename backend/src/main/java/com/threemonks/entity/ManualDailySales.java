package com.threemonks.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One day's sales at a branch that takes orders by hand: shots and blends sold,
 * and the amount worked out from the prices that applied that day (kept here, so
 * a later price change never alters past days). The amount actually received is
 * a {@link CollectionActual} for the same branch and day. One row per branch per day.
 */
@Entity
@Table(name = "manual_daily_sales",
        uniqueConstraints = @UniqueConstraint(columnNames = {"shop_id", "sales_date"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ManualDailySales {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shop_id", nullable = false)
    private Shop shop;

    @Column(name = "sales_date", nullable = false)
    private LocalDate salesDate;

    @Column(nullable = false)
    private Integer shots;

    @Column(nullable = false)
    private Integer blends;

    @Column(name = "shot_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal shotPrice;

    @Column(name = "blend_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal blendPrice;

    /** shots × shotPrice + blends × blendPrice */
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(length = 500)
    private String note;

    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
