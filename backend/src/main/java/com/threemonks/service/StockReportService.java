package com.threemonks.service;

import com.threemonks.dto.ShopStockReportResponse;
import com.threemonks.dto.StockResponse;
import com.threemonks.entity.Shop;
import com.threemonks.entity.Stock;
import com.threemonks.repository.ShopRepository;
import com.threemonks.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Builds the current-stock picture across every active shop.
 *
 * Kept separate from StockService so the planned 8 AM IST daily stock email can
 * reuse it as-is: a scheduled job only needs to call buildReportForAllShops()
 * and hand the result to EmailService. Nothing here sends mail yet.
 */
@Service
@RequiredArgsConstructor
public class StockReportService {

    private final ShopRepository shopRepository;
    private final StockRepository stockRepository;

    public List<ShopStockReportResponse> buildReportForAllShops() {
        return shopRepository.findByActiveTrue().stream()
                .map(this::buildReportForShop)
                .collect(Collectors.toList());
    }

    public ShopStockReportResponse buildReportForShop(Shop shop) {
        List<StockResponse> items = stockRepository.findByShopId(shop.getId()).stream()
                .map(this::toStockResponse)
                .sorted(Comparator.comparing(StockResponse::getRawMaterialName))
                .collect(Collectors.toList());

        return ShopStockReportResponse.builder()
                .shopId(shop.getId())
                .shopName(shop.getName())
                .items(items)
                .lowStockCount(items.stream().filter(StockResponse::getLowStock).count())
                .build();
    }

    private StockResponse toStockResponse(Stock stock) {
        boolean isLow = stock.getMinimumThreshold() != null
                && stock.getQuantity().compareTo(stock.getMinimumThreshold()) <= 0;

        return StockResponse.builder()
                .id(stock.getId())
                .shopId(stock.getShop().getId())
                .shopName(stock.getShop().getName())
                .rawMaterialId(stock.getRawMaterial().getId())
                .rawMaterialName(stock.getRawMaterial().getName())
                .unitType(stock.getRawMaterial().getUnitType().name())
                .quantity(stock.getQuantity())
                .minimumThreshold(stock.getMinimumThreshold())
                .lowStock(isLow)
                .build();
    }
}
