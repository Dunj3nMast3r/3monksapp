package com.threemonks.dto;

import com.threemonks.enums.Role;
import com.threemonks.enums.Station;
import jakarta.validation.constraints.*;
import lombok.Data;

// Admin edit of a user; leave password empty to keep the current one
@Data
public class UserUpdateRequest {
    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    @Pattern(regexp = "^[a-zA-Z0-9._-]+$", message = "Username can only contain letters, numbers, dots, hyphens, and underscores")
    private String username;

    @Size(min = 6, max = 100, message = "Password must be between 6 and 100 characters")
    private String password;

    @NotBlank(message = "Full name is required")
    @Size(min = 2, max = 100, message = "Full name must be between 2 and 100 characters")
    private String fullName;

    @Email(message = "Please enter a valid email address")
    @NotBlank(message = "Email is required")
    private String email;

    @Pattern(regexp = "^$|^[0-9]{10}$", message = "Phone number must be exactly 10 digits")
    private String phone;

    @NotNull(message = "Role is required")
    private Role role;

    // Branch for managers and operators; ignored for admins, who belong to no branch
    private Long shopId;

    // Shop operators only; null means both stations
    private Station station;
}
