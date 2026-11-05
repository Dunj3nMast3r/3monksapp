package com.threemonks.service;

import com.threemonks.dto.BulkStockEntryRequest;
import com.threemonks.dto.DailyStockSummaryResponse;
import com.threemonks.dto.PurchaseRequest;
import com.threemonks.dto.PurchaseResponse;
import com.threemonks.dto.StockAdjustmentRequest;
import com.threemonks.dto.StockEntryRequest;
import com.threemonks.dto.StockEntryResponse;
import com.threemonks.dto.StockReportResponse;
import com.threemonks.dto.StockResponse;
import com.threemonks.entity.*;
import com.threemonks.enums.Role;
import com.threemonks.enums.StockTransactionType;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.exception.UnauthorizedException;
import com.threemonks.repository.*;
import com.threemonks.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Stock is maintained by hand: purchases in, daily consumption out, and
 * adjustments against a physical count. Nothing else moves stock — orders and
 * the purchase ledger deliberately do not touch it.
 */
@Service
@RequiredArgsConstructor
public class StockService {

        private final StockRepository stockRepository;
        private final StockTransactionRepository stockTransactionRepository;
        private final PurchaseRepository purchaseRepository;
        private final RawMaterialRepository rawMaterialRepository;
        private final ShopRepository shopRepository;
        private final UserRepository userRepository;

        public List<StockResponse> getStockByShop(Long shopId, UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);
                return stockRepository.findByShopId(shopId).stream()
                                .map(this::toStockResponse)
                                .collect(Collectors.toList());
        }

        public List<StockResponse> getAllLowStock() {
                return stockRepository.findAllLowStock().stream()
                                .map(this::toStockResponse)
                                .collect(Collectors.toList());
        }

        public List<StockResponse> getLowStockByShop(Long shopId, UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);
                return stockRepository.findLowStockByShopId(shopId).stream()
                                .map(this::toStockResponse)
                                .collect(Collectors.toList());
        }

        /** Stock received. Increases the balance. */
        @Transactional
        public StockResponse recordPurchase(StockEntryRequest request, UserPrincipal currentUser) {
                return applyMovement(request.getShopId(), request.getRawMaterialId(),
                                request.getQuantity(), StockTransactionType.PURCHASE,
                                request.getTxnDate(), request.getNotes(), null,
                                request.getMinimumThreshold(), currentUser);
        }

        /** Stock used up on a given day. Decreases the balance. */
        @Transactional
        public StockResponse recordConsumption(StockEntryRequest request, UserPrincipal currentUser) {
                return applyMovement(request.getShopId(), request.getRawMaterialId(),
                                request.getQuantity().negate(), StockTransactionType.CONSUMPTION,
                                request.getTxnDate(), request.getNotes(), null,
                                request.getMinimumThreshold(), currentUser);
        }

        /**
         * Correction from a physical count: the caller says what is actually on the
         * shelf and we record the difference against the current balance.
         */
        @Transactional
        public StockResponse adjustToActualCount(StockAdjustmentRequest request, UserPrincipal currentUser) {
                validateShopAccess(request.getShopId(), currentUser);

                Stock stock = stockRepository
                                .findForUpdate(request.getShopId(), request.getRawMaterialId())
                                .orElse(null);
                BigDecimal current = stock != null ? stock.getQuantity() : BigDecimal.ZERO;
                BigDecimal delta = request.getActualCount().subtract(current);

                return applyMovement(request.getShopId(), request.getRawMaterialId(),
                                delta, StockTransactionType.ADJUSTMENT,
                                request.getTxnDate(), request.getNotes(), request.getActualCount(),
                                null, currentUser);
        }

        /**
         * Saves a whole screen of entries in one transaction. Lines are applied in
         * order and any rejection rolls the entire batch back, so the user never
         * ends up with half a day's figures recorded.
         */
        @Transactional
        public List<StockResponse> recordBulk(BulkStockEntryRequest request, UserPrincipal currentUser) {
                validateShopAccess(request.getShopId(), currentUser);

                List<StockResponse> results = new ArrayList<>();
                for (BulkStockEntryRequest.Line line : request.getLines()) {
                        results.add(applyLine(request.getShopId(), request.getType(), line, currentUser));
                }
                return results;
        }

        private StockResponse applyLine(Long shopId, StockTransactionType type,
                        BulkStockEntryRequest.Line line, UserPrincipal currentUser) {

                if (type == StockTransactionType.ADJUSTMENT) {
                        StockAdjustmentRequest adjustment = new StockAdjustmentRequest();
                        adjustment.setShopId(shopId);
                        adjustment.setRawMaterialId(line.getRawMaterialId());
                        adjustment.setActualCount(line.getQuantity());
                        adjustment.setTxnDate(line.getTxnDate());
                        adjustment.setNotes(line.getNotes());
                        return adjustToActualCount(adjustment, currentUser);
                }

                if (line.getQuantity().compareTo(BigDecimal.ZERO) <= 0) {
                        throw new BadRequestException("Quantity must be greater than zero");
                }

                BigDecimal signed = type == StockTransactionType.CONSUMPTION
                                ? line.getQuantity().negate()
                                : line.getQuantity();

                return applyMovement(shopId, line.getRawMaterialId(), signed, type,
                                line.getTxnDate(), line.getNotes(), null, null, currentUser);
        }

        public List<DailyStockSummaryResponse> getDailySummary(Long shopId, LocalDate from, LocalDate to,
                        UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);

                LocalDate end = to != null ? to : LocalDate.now();
                LocalDate start = from != null ? from : end.minusDays(30);
                if (start.isAfter(end)) {
                        throw new BadRequestException("Start date cannot be after end date");
                }

                return stockTransactionRepository.getDailySummary(shopId, start, end,
                                StockTransactionType.PURCHASE,
                                StockTransactionType.CONSUMPTION,
                                StockTransactionType.ADJUSTMENT).stream()
                                .map(row -> DailyStockSummaryResponse.builder()
                                                .txnDate((LocalDate) row[0])
                                                .rawMaterialId((Long) row[1])
                                                .rawMaterialName((String) row[2])
                                                .unitType(row[3].toString())
                                                .purchased(toAmount(row[4]))
                                                .consumed(toAmount(row[5]).abs())
                                                .adjusted(toAmount(row[6]))
                                                .build())
                                .collect(Collectors.toList());
        }

        /**
         * The single place a Stock balance changes. Locks the row for the
         * transaction so concurrent entries cannot both pass the negative check.
         */
        private StockResponse applyMovement(Long shopId, Long rawMaterialId, BigDecimal signedQuantity,
                        StockTransactionType type, LocalDate txnDate, String notes,
                        BigDecimal actualCount, BigDecimal minimumThreshold, UserPrincipal currentUser) {

                validateShopAccess(shopId, currentUser);

                Shop shop = shopRepository.findById(shopId)
                                .orElseThrow(() -> new ResourceNotFoundException("Shop", "id", shopId));
                RawMaterial rm = rawMaterialRepository.findById(rawMaterialId)
                                .orElseThrow(() -> new ResourceNotFoundException("RawMaterial", "id", rawMaterialId));
                User user = userRepository.findById(currentUser.getId())
                                .orElseThrow(() -> new ResourceNotFoundException("User", "id", currentUser.getId()));

                Stock stock = stockRepository.findForUpdate(shopId, rawMaterialId)
                                .orElseGet(() -> Stock.builder()
                                                .shop(shop)
                                                .rawMaterial(rm)
                                                .quantity(BigDecimal.ZERO)
                                                .build());

                BigDecimal newQuantity = stock.getQuantity().add(signedQuantity);
                if (newQuantity.compareTo(BigDecimal.ZERO) < 0) {
                        throw new BadRequestException(String.format(
                                        "Not enough %s in stock. Available: %s %s, requested: %s %s",
                                        rm.getName(), stock.getQuantity().toPlainString(), rm.getUnitType(),
                                        signedQuantity.abs().toPlainString(), rm.getUnitType()));
                }

                stock.setQuantity(newQuantity);
                if (minimumThreshold != null) {
                        stock.setMinimumThreshold(minimumThreshold);
                }
                Stock saved = stockRepository.save(stock);

                // One row per material per day per type. Entering the same material
                // again for the same date folds into that row instead of adding
                // another, so a day always reads as a single figure.
                LocalDate date = txnDate != null ? txnDate : LocalDate.now();
                StockTransaction txn = stockTransactionRepository
                                .findByShopIdAndRawMaterialIdAndTxnDateAndTxnType(shopId, rawMaterialId, date, type)
                                .orElse(null);

                if (txn == null) {
                        txn = StockTransaction.builder()
                                        .shop(shop)
                                        .rawMaterial(rm)
                                        .txnDate(date)
                                        .txnType(type)
                                        .quantityChange(signedQuantity)
                                        .actualCount(actualCount)
                                        .notes(notes)
                                        .createdBy(user)
                                        .updatedBy(user)
                                        .build();
                } else {
                        txn.setQuantityChange(txn.getQuantityChange().add(signedQuantity));
                        if (actualCount != null) {
                                // An adjustment is absolute, so the latest count wins.
                                txn.setActualCount(actualCount);
                        }
                        if (notes != null && !notes.isBlank()) {
                                txn.setNotes(notes);
                        }
                        txn.setUpdatedBy(user);
                }
                stockTransactionRepository.save(txn);

                return toStockResponse(saved);
        }

        // ---------------------------------------------------------------
        // Purchase ledger — vendor, invoice and GST records.
        //
        // NOTE: recording or deleting a purchase deliberately does NOT move
        // stock. Stock is maintained manually through the stock entry screens,
        // so this path must stay free of stock side effects.
        // ---------------------------------------------------------------
        @Transactional
        public PurchaseResponse createPurchase(PurchaseRequest request, UserPrincipal currentUser) {
                validateShopAccess(request.getShopId(), currentUser);

                Shop shop = shopRepository.findById(request.getShopId())
                                .orElseThrow(() -> new ResourceNotFoundException("Shop", "id", request.getShopId()));
                RawMaterial rm = rawMaterialRepository.findById(request.getRawMaterialId())
                                .orElseThrow(() -> new ResourceNotFoundException("RawMaterial", "id",
                                                request.getRawMaterialId()));
                User user = userRepository.findById(currentUser.getId())
                                .orElseThrow(() -> new ResourceNotFoundException("User", "id", currentUser.getId()));

                Purchase purchase = Purchase.builder()
                                .shop(shop)
                                .rawMaterial(rm)
                                .quantity(request.getQuantity())
                                .totalCost(request.getTotalCost())
                                .vendorName(request.getVendorName())
                                .invoiceNumber(request.getInvoiceNumber())
                                .purchaseDate(request.getPurchaseDate() != null ? request.getPurchaseDate()
                                                : LocalDate.now())
                                .purchasedBy(user)
                                .gstPercentage(request.getGstPercentage())
                                .gstAmount(request.getGstAmount())
                                .build();

                Purchase saved = purchaseRepository.save(purchase);

                rm.setLastPurchaseDate(saved.getPurchaseDate());
                rawMaterialRepository.save(rm);

                return toPurchaseResponse(saved);
        }

        public List<PurchaseResponse> getPurchasesByShop(Long shopId, UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);
                return purchaseRepository.findByShopIdOrderByCreatedAtDesc(shopId).stream()
                                .map(this::toPurchaseResponse)
                                .collect(Collectors.toList());
        }

        @Transactional
        public void deletePurchase(Long purchaseId, UserPrincipal currentUser) {
                Purchase purchase = purchaseRepository.findById(purchaseId)
                                .orElseThrow(() -> new ResourceNotFoundException("Purchase", "id", purchaseId));

                if (currentUser.getRole() != Role.SUPER_ADMIN) {
                        throw new UnauthorizedException("Only admin can delete purchases");
                }

                purchaseRepository.delete(purchase);
        }

        private void validateShopAccess(Long shopId, UserPrincipal currentUser) {
                if (currentUser.getRole() != Role.SUPER_ADMIN && !currentUser.getShopId().equals(shopId)) {
                        throw new UnauthorizedException("Access denied to this shop's data");
                }
        }

        // Entries can be removed for this many days (today included); older mistakes use Correct Count
        private static final int REMOVABLE_DAYS = 7;

        /**
         * Opening, received, used, corrected and closing per material for a date range. Anchored on
         * today's balance: closing = balance now minus everything dated after the range, so the report
         * stays right even for stock recorded before the ledger existed.
         */
        public List<StockReportResponse> getStockReport(Long shopId, LocalDate from, LocalDate to,
                        UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);
                LocalDate end = to != null ? to : LocalDate.now();
                LocalDate start = from != null ? from : end;
                if (start.isAfter(end)) {
                        throw new BadRequestException("Start date cannot be after end date");
                }
                return buildStockReport(shopId, start, end);
        }

        // Same report without an access check, for server-side jobs (daily summary email)
        public List<StockReportResponse> buildStockReport(Long shopId, LocalDate start, LocalDate end) {
                Map<Long, BigDecimal> balanceNow = new HashMap<>();
                stockRepository.findByShopId(shopId).forEach(s -> balanceNow.put(s.getRawMaterial().getId(), s.getQuantity()));
                Map<Long, BigDecimal> changedAfter = new HashMap<>();
                stockTransactionRepository.sumChangesAfter(shopId, end)
                                .forEach(row -> changedAfter.put((Long) row[0], toAmount(row[1])));

                // received, consumed (signed, negative) and corrected per material over the range
                Map<Long, BigDecimal[]> moved = new HashMap<>();
                stockTransactionRepository.getDailySummary(shopId, start, end, StockTransactionType.PURCHASE,
                                StockTransactionType.CONSUMPTION, StockTransactionType.ADJUSTMENT)
                                .forEach(row -> {
                                        BigDecimal[] sums = moved.computeIfAbsent((Long) row[1],
                                                        id -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
                                        sums[0] = sums[0].add(toAmount(row[4]));
                                        sums[1] = sums[1].add(toAmount(row[5]));
                                        sums[2] = sums[2].add(toAmount(row[6]));
                                });

                // Active materials, plus any inactive one that still has stock or moved in the range
                Map<Long, RawMaterial> materials = new LinkedHashMap<>();
                rawMaterialRepository.findAll().stream()
                                .filter(m -> Boolean.TRUE.equals(m.getActive()) || moved.containsKey(m.getId())
                                                || balanceNow.getOrDefault(m.getId(), BigDecimal.ZERO).signum() != 0)
                                .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
                                .forEach(m -> materials.put(m.getId(), m));

                List<StockReportResponse> report = new ArrayList<>();
                for (RawMaterial m : materials.values()) {
                        BigDecimal[] sums = moved.getOrDefault(m.getId(),
                                        new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
                        BigDecimal closing = balanceNow.getOrDefault(m.getId(), BigDecimal.ZERO)
                                        .subtract(changedAfter.getOrDefault(m.getId(), BigDecimal.ZERO));
                        BigDecimal opening = closing.subtract(sums[0]).subtract(sums[1]).subtract(sums[2]);
                        report.add(StockReportResponse.builder()
                                        .rawMaterialId(m.getId())
                                        .rawMaterialName(m.getName())
                                        .unitType(m.getUnitType().name())
                                        .opening(opening)
                                        .received(sums[0])
                                        .used(sums[1].abs())
                                        .corrected(sums[2])
                                        .closing(closing)
                                        .build());
                }
                return report;
        }

        // Current balances with Low status, without an access check, for server-side jobs
        public List<StockResponse> currentStock(Long shopId) {
                return stockRepository.findByShopId(shopId).stream()
                                .map(this::toStockResponse)
                                .collect(Collectors.toList());
        }

        public List<StockEntryResponse> getEntries(Long shopId, LocalDate date, UserPrincipal currentUser) {
                validateShopAccess(shopId, currentUser);
                LocalDate day = date != null ? date : LocalDate.now();
                return stockTransactionRepository.findByShopIdAndTxnDateOrderByCreatedAtDesc(shopId, day).stream()
                                .map(this::toEntryResponse)
                                .collect(Collectors.toList());
        }

        /**
         * Removes a recent entry and reverses its effect on the balance, for fixing a mistake. Refused
         * when it would take the balance below zero (e.g. a delivery whose stock was already used).
         */
        @Transactional
        public StockResponse removeEntry(Long entryId, UserPrincipal currentUser) {
                StockTransaction txn = stockTransactionRepository.findById(entryId)
                                .orElseThrow(() -> new ResourceNotFoundException("Stock entry", "id", entryId));
                Long shopId = txn.getShop().getId();
                validateShopAccess(shopId, currentUser);
                if (!isRemovable(txn)) {
                        throw new BadRequestException("Entries older than " + REMOVABLE_DAYS
                                        + " days cannot be removed. Use Correct Count to set the right figure.");
                }

                RawMaterial rm = txn.getRawMaterial();
                Stock stock = stockRepository.findForUpdate(shopId, rm.getId())
                                .orElseThrow(() -> new BadRequestException("No stock record for " + rm.getName()));
                BigDecimal restored = stock.getQuantity().subtract(txn.getQuantityChange());
                if (restored.compareTo(BigDecimal.ZERO) < 0) {
                        throw new BadRequestException(String.format(
                                        "Removing this entry would take %s below zero (now %s %s). Use Correct Count instead.",
                                        rm.getName(), stock.getQuantity().toPlainString(), rm.getUnitType()));
                }
                stock.setQuantity(restored);
                Stock saved = stockRepository.save(stock);
                stockTransactionRepository.delete(txn);
                return toStockResponse(saved);
        }

        private boolean isRemovable(StockTransaction txn) {
                return !txn.getTxnDate().isBefore(LocalDate.now().minusDays(REMOVABLE_DAYS - 1));
        }

        private StockEntryResponse toEntryResponse(StockTransaction t) {
                BigDecimal entered = t.getTxnType() == StockTransactionType.ADJUSTMENT && t.getActualCount() != null
                                ? t.getActualCount() : t.getQuantityChange().abs();
                User by = t.getUpdatedBy() != null ? t.getUpdatedBy() : t.getCreatedBy();
                return StockEntryResponse.builder()
                                .id(t.getId())
                                .rawMaterialId(t.getRawMaterial().getId())
                                .rawMaterialName(t.getRawMaterial().getName())
                                .unitType(t.getRawMaterial().getUnitType().name())
                                .type(t.getTxnType())
                                .txnDate(t.getTxnDate())
                                .quantity(entered)
                                .balanceChange(t.getQuantityChange())
                                .enteredBy(by != null ? by.getFullName() : null)
                                .updatedAt(t.getUpdatedAt())
                                .removable(isRemovable(t))
                                .build();
        }

        private BigDecimal toAmount(Object value) {
                return value != null ? (BigDecimal) value : BigDecimal.ZERO;
        }

        private StockResponse toStockResponse(Stock stock) {
                // The shop's own minimum if one was set, else the material's reorder level
                BigDecimal minimum = stock.getMinimumThreshold() != null
                                ? stock.getMinimumThreshold() : stock.getRawMaterial().getReorderLevel();
                boolean isLow = minimum != null && stock.getQuantity().compareTo(minimum) <= 0;

                return StockResponse.builder()
                                .id(stock.getId())
                                .shopId(stock.getShop().getId())
                                .shopName(stock.getShop().getName())
                                .rawMaterialId(stock.getRawMaterial().getId())
                                .rawMaterialName(stock.getRawMaterial().getName())
                                .unitType(stock.getRawMaterial().getUnitType().name())
                                .quantity(stock.getQuantity())
                                .minimumThreshold(minimum)
                                .lowStock(isLow)
                                .build();
        }

        private PurchaseResponse toPurchaseResponse(Purchase p) {
                return PurchaseResponse.builder()
                                .id(p.getId())
                                .shopId(p.getShop().getId())
                                .shopName(p.getShop().getName())
                                .rawMaterialId(p.getRawMaterial().getId())
                                .rawMaterialName(p.getRawMaterial().getName())
                                .quantity(p.getQuantity())
                                .totalCost(p.getTotalCost())
                                .gstPercentage(p.getGstPercentage())
                                .gstAmount(p.getGstAmount())
                                .vendorName(p.getVendorName())
                                .invoiceNumber(p.getInvoiceNumber())
                                .purchaseDate(p.getPurchaseDate())
                                .purchasedByName(p.getPurchasedBy() != null ? p.getPurchasedBy().getFullName() : null)
                                .build();
        }
}
