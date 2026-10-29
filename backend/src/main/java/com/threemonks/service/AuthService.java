package com.threemonks.service;

import com.threemonks.dto.LoginRequest;
import com.threemonks.dto.LoginResponse;
import com.threemonks.entity.User;
import com.threemonks.enums.Role;
import com.threemonks.exception.BadRequestException;
import com.threemonks.repository.UserRepository;
import com.threemonks.security.JwtTokenProvider;
import com.threemonks.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;

    public LoginResponse login(LoginRequest loginRequest) {
        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(loginRequest.getUsername(), loginRequest.getPassword())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String token = tokenProvider.generateToken(authentication);

        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        User user = userRepository.findByUsername(principal.getUsername()).orElseThrow();
        // Shop staff get their shop when the admin registers them as an employee
        if (user.getRole() != Role.SUPER_ADMIN && user.getShop() == null) {
            throw new BadRequestException("Your account is not assigned to a shop yet. Please ask the admin to register you as an employee.");
        }

        return LoginResponse.builder()
                .token(token)
                .username(user.getUsername())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(user.getRole())
                .shopId(user.getShop() != null ? user.getShop().getId() : null)
                .shopName(user.getShop() != null ? user.getShop().getName() : null)
                .station(user.getStation())
                .build();
    }

    public UserPrincipal getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (UserPrincipal) auth.getPrincipal();
    }
}
