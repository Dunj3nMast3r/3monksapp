package com.threemonks.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ShopRequest {
    @NotBlank(message = "Shop name is required")
    private String name;

    @NotBlank(message = "Address is required")
    private String address;

    private String city;
    private String state;
    private String pincode;
    private String phone;
    private String email;
    private String gstNumber;
}
