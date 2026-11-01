package com.threemonks.entity;

import com.threemonks.enums.Station;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A device that receives phone notifications for a user's order queue
@Entity
@Table(name = "push_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 2048)
    private String endpoint;

    @Column(nullable = false, length = 255)
    private String p256dh;

    @Column(nullable = false, length = 255)
    private String auth;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Queue the device shows: the shop (used for admins, who have none) and station view
    // (null = all). An operator's assigned station always takes precedence.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shop_id")
    private Shop shop;

    @Enumerated(EnumType.STRING)
    private Station station;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
