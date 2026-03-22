package com.threemonks.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "fruits")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Fruit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String imageUrl;

    @Column(name = "short_code")
    private Integer shortCode;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    // Eligibility for shots, blends, or both
    @Column(nullable = false)
    @Builder.Default
    private Boolean eligibleForShot = true;

    @Column(nullable = false)
    @Builder.Default
    private Boolean eligibleForBlend = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
