package com.threemonks.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// The server's VAPID key pair for Web Push, generated once and kept so device subscriptions stay valid
@Entity
@Table(name = "push_keys")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushKeyPair {

    @Id
    private Long id;

    @Column(name = "public_key", nullable = false, length = 512)
    private String publicKey;

    @Column(name = "private_key", nullable = false, length = 512)
    private String privateKey;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
