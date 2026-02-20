package com.threemonks.controller;

import com.threemonks.dto.*;
import com.threemonks.service.*;
import com.threemonks.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
@RequiredArgsConstructor
public class AdminController {

    private final ShopService shopService;
    private final UserService userService;
    private final FruitService fruitService;
    private final ProductService productService;
    private final RawMaterialService rawMaterialService;
    private final AuthService authService;
    private final RecipeService recipeService;
    private final EmployeeService employeeService;

    // Shop management
    @GetMapping("/shops")
    public ResponseEntity<ApiResponse<List<ShopResponse>>> getAllShops() {
        return ResponseEntity.ok(ApiResponse.success(shopService.getAllShops()));
    }

    @PostMapping("/shops")
    public ResponseEntity<ApiResponse<ShopResponse>> createShop(@Valid @RequestBody ShopRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Shop created", shopService.createShop(request)));
    }

    @PutMapping("/shops/{id}")
    public ResponseEntity<ApiResponse<ShopResponse>> updateShop(@PathVariable Long id, @Valid @RequestBody ShopRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Shop updated", shopService.updateShop(id, request)));
    }

    @PatchMapping("/shops/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleShop(@PathVariable Long id) {
        shopService.toggleShopStatus(id);
        return ResponseEntity.ok(ApiResponse.success("Shop status toggled", null));
    }

    // User management
    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        return ResponseEntity.ok(ApiResponse.success(userService.getAllUsers()));
    }

    @PostMapping("/users")
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            @Valid @RequestBody UserRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success("User created", userService.createUser(request, currentUser)));
    }

    @PatchMapping("/users/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleUser(@PathVariable Long id) {
        userService.toggleUserStatus(id);
        return ResponseEntity.ok(ApiResponse.success("User status toggled", null));
    }

    // Fruit management
    @PostMapping("/fruits")
    public ResponseEntity<ApiResponse<FruitResponse>> createFruit(@Valid @RequestBody FruitRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Fruit created", fruitService.createFruit(request)));
    }

    @PutMapping("/fruits/{id}")
    public ResponseEntity<ApiResponse<FruitResponse>> updateFruit(@PathVariable Long id, @Valid @RequestBody FruitRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Fruit updated", fruitService.updateFruit(id, request)));
    }

    @PatchMapping("/fruits/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleFruit(@PathVariable Long id) {
        fruitService.toggleFruitStatus(id);
        return ResponseEntity.ok(ApiResponse.success("Fruit status toggled", null));
    }

    // Product management
    @GetMapping("/products")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getAllProducts() {
        return ResponseEntity.ok(ApiResponse.success(productService.getAllProducts()));
    }

    @PostMapping("/products")
    public ResponseEntity<ApiResponse<ProductResponse>> createProduct(@Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Product created", productService.createProduct(request)));
    }

    @PutMapping("/products/{id}")
    public ResponseEntity<ApiResponse<ProductResponse>> updateProduct(@PathVariable Long id, @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Product updated", productService.updateProduct(id, request)));
    }

    @PatchMapping("/products/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleProduct(@PathVariable Long id) {
        productService.toggleProductStatus(id);
        return ResponseEntity.ok(ApiResponse.success("Product status toggled", null));
    }

    @PostMapping("/products/{id}/image")
    public ResponseEntity<ApiResponse<Void>> uploadProductImage(
            @PathVariable Long id,
            @RequestParam("image") MultipartFile image) {
        productService.uploadProductImage(id, image);
        return ResponseEntity.ok(ApiResponse.success("Product image uploaded", null));
    }

    @DeleteMapping("/products/{id}/image")
    public ResponseEntity<ApiResponse<Void>> deleteProductImage(@PathVariable Long id) {
        productService.deleteProductImage(id);
        return ResponseEntity.ok(ApiResponse.success("Product image deleted", null));
    }

    // Raw Material management
    @GetMapping("/raw-materials")
    public ResponseEntity<ApiResponse<List<RawMaterialResponse>>> getAllRawMaterials() {
        return ResponseEntity.ok(ApiResponse.success(rawMaterialService.getAllRawMaterials()));
    }

    @PostMapping("/raw-materials")
    public ResponseEntity<ApiResponse<RawMaterialResponse>> createRawMaterial(@Valid @RequestBody RawMaterialRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Raw material created", rawMaterialService.createRawMaterial(request)));
    }

    @PutMapping("/raw-materials/{id}")
    public ResponseEntity<ApiResponse<RawMaterialResponse>> updateRawMaterial(@PathVariable Long id, @Valid @RequestBody RawMaterialRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Raw material updated", rawMaterialService.updateRawMaterial(id, request)));
    }

    @PatchMapping("/raw-materials/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleRawMaterial(@PathVariable Long id) {
        rawMaterialService.toggleRawMaterialStatus(id);
        return ResponseEntity.ok(ApiResponse.success("Raw material status toggled", null));
    }

    // Recipe management
    @GetMapping("/recipes")
    public ResponseEntity<ApiResponse<List<RecipeResponse>>> getAllRecipes() {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getAllRecipes()));
    }

    @GetMapping("/recipes/product/{productId}")
    public ResponseEntity<ApiResponse<List<RecipeResponse>>> getRecipesByProduct(@PathVariable Long productId) {
        return ResponseEntity.ok(ApiResponse.success(recipeService.getRecipesByProduct(productId)));
    }

    @PostMapping("/recipes")
    public ResponseEntity<ApiResponse<RecipeResponse>> createRecipe(@Valid @RequestBody RecipeRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Recipe created", recipeService.createRecipe(request)));
    }

    @PutMapping("/recipes/{id}")
    public ResponseEntity<ApiResponse<RecipeResponse>> updateRecipe(@PathVariable Long id, @Valid @RequestBody RecipeRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Recipe updated", recipeService.updateRecipe(id, request)));
    }

    @DeleteMapping("/recipes/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteRecipe(@PathVariable Long id) {
        recipeService.deleteRecipe(id);
        return ResponseEntity.ok(ApiResponse.success("Recipe deleted", null));
    }

    // Employee management
    @GetMapping("/employees")
    public ResponseEntity<ApiResponse<List<EmployeeResponse>>> getAllEmployees() {
        return ResponseEntity.ok(ApiResponse.success(employeeService.getAllEmployees()));
    }

    @GetMapping("/employees/{id}")
    public ResponseEntity<ApiResponse<EmployeeResponse>> getEmployee(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(employeeService.getEmployeeById(id)));
    }

    @GetMapping("/employees/shop/{shopId}")
    public ResponseEntity<ApiResponse<List<EmployeeResponse>>> getEmployeesByShop(@PathVariable Long shopId) {
        return ResponseEntity.ok(ApiResponse.success(employeeService.getEmployeesByShop(shopId)));
    }

    @PostMapping("/employees")
    public ResponseEntity<ApiResponse<EmployeeResponse>> createEmployee(@Valid @RequestBody EmployeeRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Employee created", employeeService.createEmployee(request)));
    }

    @PutMapping("/employees/{id}")
    public ResponseEntity<ApiResponse<EmployeeResponse>> updateEmployee(@PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Employee updated", employeeService.updateEmployee(id, request)));
    }

    @PatchMapping("/employees/{id}/toggle")
    public ResponseEntity<ApiResponse<Void>> toggleEmployee(@PathVariable Long id) {
        employeeService.toggleEmployeeStatus(id);
        return ResponseEntity.ok(ApiResponse.success("Employee status toggled", null));
    }

    @GetMapping("/salary-sheet")
    public ResponseEntity<ApiResponse<SalarySheetResponse.MonthlySummary>> getSalarySheet(
            @RequestParam(required = false) Long shopId,
            @RequestParam String month) {
        return ResponseEntity.ok(ApiResponse.success(employeeService.getMonthlySalarySheet(shopId, month)));
    }
}
