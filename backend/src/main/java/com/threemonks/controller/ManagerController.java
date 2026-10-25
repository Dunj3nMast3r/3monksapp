package com.threemonks.controller;

import com.threemonks.dto.*;
import com.threemonks.service.*;
import com.threemonks.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/manager")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SHOP_MANAGER')")
@RequiredArgsConstructor
public class ManagerController {

    private final UserService userService;
    private final StockService stockService;
    private final AuthService authService;

    // Users in shop
    @GetMapping("/shop/{shopId}/users")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getShopUsers(
            @PathVariable Long shopId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUsersByShop(shopId)));
    }

    @PostMapping("/users")
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            @Valid @RequestBody UserRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("User created", userService.createUser(request, currentUser)));
    }

    // Stock management
    @GetMapping("/shop/{shopId}/stock")
    public ResponseEntity<ApiResponse<List<StockResponse>>> getShopStock(
            @PathVariable Long shopId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(stockService.getStockByShop(shopId, currentUser)));
    }

    @PostMapping("/stock/purchase")
    public ResponseEntity<ApiResponse<StockResponse>> recordPurchase(
            @Valid @RequestBody StockEntryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("Stock added",
                stockService.recordPurchase(request, currentUser)));
    }

    @PostMapping("/stock/consumption")
    public ResponseEntity<ApiResponse<StockResponse>> recordConsumption(
            @Valid @RequestBody StockEntryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("Consumption recorded",
                stockService.recordConsumption(request, currentUser)));
    }

    @PostMapping("/stock/adjustment")
    public ResponseEntity<ApiResponse<StockResponse>> adjustStock(
            @Valid @RequestBody StockAdjustmentRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("Stock adjusted",
                stockService.adjustToActualCount(request, currentUser)));
    }

    /** Day-wise roll-up: one row per material per day, however many entries were made. */
    @GetMapping("/shop/{shopId}/stock/summary")
    public ResponseEntity<ApiResponse<List<DailyStockSummaryResponse>>> getStockSummary(
            @PathVariable Long shopId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(
                stockService.getDailySummary(shopId, from, to, currentUser)));
    }

    @GetMapping("/shop/{shopId}/stock/low")
    public ResponseEntity<ApiResponse<List<StockResponse>>> getLowStock(
            @PathVariable Long shopId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(stockService.getLowStockByShop(shopId, currentUser)));
    }

    // Purchase management
    @PostMapping("/purchases")
    public ResponseEntity<ApiResponse<PurchaseResponse>> createPurchase(
            @Valid @RequestBody PurchaseRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("Purchase recorded", stockService.createPurchase(request, currentUser)));
    }

    @GetMapping("/shop/{shopId}/purchases")
    public ResponseEntity<ApiResponse<List<PurchaseResponse>>> getShopPurchases(
            @PathVariable Long shopId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(stockService.getPurchasesByShop(shopId, currentUser)));
    }
}
