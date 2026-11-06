package com.threemonks.controller;

import com.threemonks.util.BusinessDay;
import com.threemonks.dto.*;
import com.threemonks.service.CollectionService;
import com.threemonks.service.DashboardOverviewService;
import com.threemonks.service.DashboardService;
import com.threemonks.service.AnalyticsService;
import com.threemonks.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;
    private final AnalyticsService analyticsService;
    private final CollectionService collectionService;
    private final DashboardOverviewService dashboardOverviewService;

    @GetMapping("/admin")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<DashboardResponse>> getAdminDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from == null) from = BusinessDay.today().withDayOfMonth(1);
        if (to == null) to = BusinessDay.today();
        return ResponseEntity.ok(ApiResponse.success(dashboardService.getSuperAdminDashboard(from, to)));
    }

    @GetMapping("/shop/{shopId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SHOP_MANAGER')")
    public ResponseEntity<ApiResponse<DashboardResponse>> getShopDashboard(
            @PathVariable Long shopId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        if (from == null) from = BusinessDay.today().withDayOfMonth(1);
        if (to == null) to = BusinessDay.today();
        return ResponseEntity.ok(ApiResponse.success(dashboardService.getShopDashboard(shopId, from, to, currentUser)));
    }

    @GetMapping("/profit-loss")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SHOP_MANAGER')")
    public ResponseEntity<ApiResponse<ProfitLossResponse>> getProfitLoss(
            @RequestParam(required = false) Long shopId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(dashboardService.getProfitLoss(shopId, from, to, currentUser)));
    }

    /**
     * Day-end reconciliation for every branch: shots and blends sold against the
     * cash and UPI collected. Admin only — a branch's own staff must not be able
     * to read, or compare, another branch's till.
     */
    @GetMapping("/collection")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<DailyCollectionResponse>> getDailyCollection(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long shopId) {
        if (from == null) from = BusinessDay.today();
        if (to == null) to = from;
        return ResponseEntity.ok(ApiResponse.success(collectionService.getDailyCollection(from, to, shopId)));
    }

    /**
     * The admin dashboard: today first, peak hours, best sellers and a branch
     * leaderboard. Admin only, and deliberately separate from /admin, which the
     * Shop Manager dashboard still uses.
     */
    @GetMapping("/overview")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<DashboardOverviewResponse>> getOverview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(ApiResponse.success(dashboardOverviewService.getOverview(date)));
    }

    @GetMapping("/analytics")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<AnalyticsResponse>> getAnalytics(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from == null) from = BusinessDay.today().withDayOfMonth(1);
        if (to == null) to = BusinessDay.today();
        return ResponseEntity.ok(ApiResponse.success(analyticsService.getAnalytics(from, to)));
    }
}
