package com.threemonks.dto;

import com.threemonks.enums.Station;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

// A browser PushSubscription plus the queue view the device is showing
@Data
public class PushSubscriptionRequest {
    @NotBlank(message = "Endpoint is required")
    private String endpoint;

    @NotNull(message = "Keys are required")
    @Valid
    private Keys keys;

    // Station view on the device; null = all. Ignored for operators with an assigned station.
    private Station station;

    // Only used for admins, who have no shop of their own
    private Long shopId;

    @Data
    public static class Keys {
        @NotBlank(message = "p256dh is required")
        private String p256dh;

        @NotBlank(message = "auth is required")
        private String auth;
    }
}
