package com.threemonks.controller;

import com.threemonks.dto.*;
import com.threemonks.entity.Product;
import com.threemonks.service.FruitService;
import com.threemonks.service.ProductService;
import com.threemonks.service.ShopService;
import com.threemonks.enums.ProductCategory;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicController {

    private final ProductService productService;
    private final FruitService fruitService;
    private final ShopService shopService;

    @GetMapping("/menu")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getMenu() {
        return ResponseEntity.ok(ApiResponse.success(productService.getActiveProducts()));
    }

    @GetMapping("/menu/shots")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getShots() {
        return ResponseEntity.ok(ApiResponse.success(productService.getProductsByCategory(ProductCategory.SHOT)));
    }

    @GetMapping("/menu/creamy-blends")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getCreamyBlends() {
        return ResponseEntity
                .ok(ApiResponse.success(productService.getProductsByCategory(ProductCategory.CREAMY_BLEND)));
    }

    @GetMapping("/menu/curated-blends")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getCuratedBlends() {
        return ResponseEntity
                .ok(ApiResponse.success(productService.getProductsByCategory(ProductCategory.CURATED_BLEND)));
    }

    @GetMapping("/fruits")
    public ResponseEntity<ApiResponse<List<FruitResponse>>> getFruits() {
        return ResponseEntity.ok(ApiResponse.success(fruitService.getActiveFruits()));
    }

    @GetMapping("/shops")
    public ResponseEntity<ApiResponse<List<ShopResponse>>> getShops() {
        return ResponseEntity.ok(ApiResponse.success(shopService.getActiveShops()));
    }

    @GetMapping("/products/{id}/image")
    public ResponseEntity<byte[]> getProductImage(@PathVariable Long id) {
        Product product = productService.findProductById(id);
        if (product.getImage() == null || product.getImage().length == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(product.getImageContentType()))
                .cacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic())
                .body(product.getImage());
    }
}
