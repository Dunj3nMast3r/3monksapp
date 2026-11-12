package com.threemonks.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "shops")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Shop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String address;

    private String city;
    private String state;
    private String pincode;
    private String phone;
    private String email;
    private String gstNumber;

    @Column(nullable = false)
    private Boolean active = true;

    /**
     * Orders are not taken in the app here: each day's shots, blends and amount
     * received are entered by hand (Manual Sales Entry), and the sales amount is worked
     * out from these prices. Null on branches created before this existed.
     */
    @Column(name = "manual_sales")
    private Boolean manualSales;

    @Column(name = "shot_price", precision = 10, scale = 2)
    private BigDecimal shotPrice;

    @Column(name = "blend_price", precision = 10, scale = 2)
    private BigDecimal blendPrice;

    /** Paid leaves each employee here gets per month; null or 0 = leave balance not tracked. */
    @Column(name = "monthly_leaves", precision = 4, scale = 1)
    private BigDecimal monthlyLeaves;

    /**
     * First month leave is given here (stored as its 1st day). Earlier months give
     * nothing and count nothing; null = from each employee's joining month.
     */
    @Column(name = "leave_start_month")
    private java.time.LocalDate leaveStartMonth;

    /**
     * Staff sales incentive: each operator present gets (shots + blends sold that day
     * − free units) × per-unit amount; a half day gets half. Off when not enabled.
     */
    @Column(name = "incentive_enabled")
    private Boolean incentiveEnabled;

    @Column(name = "incentive_free_units")
    private Integer incentiveFreeUnits;

    @Column(name = "incentive_per_unit", precision = 8, scale = 2)
    private BigDecimal incentivePerUnit;

    /** First day the incentive counts. */
    @Column(name = "incentive_start_date")
    private java.time.LocalDate incentiveStartDate;

    public boolean isIncentiveOn() {
        return Boolean.TRUE.equals(incentiveEnabled) && incentiveFreeUnits != null && incentivePerUnit != null
                && incentiveStartDate != null;
    }

    public boolean isManualSales() {
        return Boolean.TRUE.equals(manualSales);
    }

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
