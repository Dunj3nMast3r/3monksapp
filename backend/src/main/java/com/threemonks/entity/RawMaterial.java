package com.threemonks.entity;

import com.threemonks.enums.RawMaterialCategory;
import com.threemonks.enums.UnitType;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "raw_materials")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RawMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UnitType unitType;

    // FRUIT forces KG; null only for rows from before categories (set at startup by DatabaseMigration)
    @Enumerated(EnumType.STRING)
    private RawMaterialCategory category;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal costPerUnit;

    private String vendorName;
    private String vendorContact;

    @Column(precision = 12, scale = 3)
    private BigDecimal reorderLevel;

    private LocalDate lastPurchaseDate;
    private LocalDate expiryDate;

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
