package com.threemonks.controller;

import com.threemonks.dto.ApiResponse;
import com.threemonks.dto.PushSubscriptionRequest;
import com.threemonks.security.UserPrincipal;
import com.threemonks.service.PushNotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
@RequiredArgsConstructor
public class PushController {

    private final PushNotificationService pushNotificationService;

    @GetMapping("/public-key")
    public ResponseEntity<ApiResponse<Map<String, String>>> getPublicKey() {
        return ResponseEntity.ok(ApiResponse.success(Map.of("publicKey", pushNotificationService.getPublicKey())));
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<ApiResponse<Void>> subscribe(
            @Valid @RequestBody PushSubscriptionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        pushNotificationService.subscribe(request, currentUser);
        return ResponseEntity.ok(ApiResponse.success("Phone notifications on", null));
    }

    @PostMapping("/subscriptions/remove")
    public ResponseEntity<ApiResponse<Void>> unsubscribe(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        pushNotificationService.unsubscribe(body.get("endpoint"), currentUser);
        return ResponseEntity.ok(ApiResponse.success("Phone notifications off", null));
    }
}
