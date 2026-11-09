package com.threemonks.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ShopRequest {
    @NotBlank(message = "Shop name is required")
    @Size(min = 2, max = 100, message = "Shop name must be between 2 and 100 characters")
    private String name;

    @NotBlank(message = "Address is required")
    @Size(min = 5, max = 500, message = "Address must be between 5 and 500 characters")
    private String address;

    @Size(max = 100, message = "City name cannot exceed 100 characters")
    private String city;

    @Size(max = 100, message = "State name cannot exceed 100 characters")
    private String state;

    @Pattern(regexp = "^$|^[0-9]{6}$", message = "Pincode must be exactly 6 digits")
    private String pincode;

    @Pattern(regexp = "^$|^[0-9]{10}$", message = "Phone number must be exactly 10 digits")
    private String phone;

    @Email(message = "Please enter a valid email address")
    private String email;

    @Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", message = "Please enter a valid 15-character GST number")
    private String gstNumber;

    /** Sales entered by hand each day (Daily Sales) instead of app orders. */
    private Boolean manualSales;

    @DecimalMin(value = "0.01", message = "Shot price must be more than 0")
    @Digits(integer = 8, fraction = 2, message = "Shot price can have at most 2 decimals")
    private BigDecimal shotPrice;

    @DecimalMin(value = "0.01", message = "Blend price must be more than 0")
    @Digits(integer = 8, fraction = 2, message = "Blend price can have at most 2 decimals")
    private BigDecimal blendPrice;
}
