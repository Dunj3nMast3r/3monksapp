package com.threemonks.service;

import com.threemonks.dto.UserRequest;
import com.threemonks.dto.UserResponse;
import com.threemonks.dto.UserUpdateRequest;
import com.threemonks.entity.Employee;
import com.threemonks.entity.Shop;
import com.threemonks.entity.User;
import com.threemonks.enums.Role;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.exception.UnauthorizedException;
import com.threemonks.repository.EmployeeRepository;
import com.threemonks.repository.ShopRepository;
import com.threemonks.repository.UserRepository;
import com.threemonks.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final ShopRepository shopRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmployeeRepository employeeRepository;
    private final OrderEventService orderEventService;

    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<UserResponse> getUsersByShop(Long shopId) {
        return userRepository.findByShopId(shopId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public UserResponse getUserById(Long id) {
        return toResponse(findUserById(id));
    }

    @Transactional
    public UserResponse createUser(UserRequest request, UserPrincipal currentUser) {
        // Validate unique constraints
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BadRequestException("Username already exists");
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already exists");
        }

        // Validate role-based user creation
        validateUserCreation(request, currentUser);

        Shop shop = null;
        if (request.getShopId() != null) {
            shop = shopRepository.findById(request.getShopId())
                    .orElseThrow(() -> new ResourceNotFoundException("Shop", "id", request.getShopId()));
        }

        User user = User.builder()
                .username(request.getUsername())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .role(request.getRole())
                .shop(shop)
                .active(true)
                .build();

        return toResponse(userRepository.save(user));
    }

    // Admin edit of every field. Admins belong to no branch. For someone registered as an
    // employee, the employee record follows the new branch so login and payroll still agree.
    @Transactional
    public UserResponse updateUser(Long id, UserUpdateRequest request, UserPrincipal currentUser) {
        User user = findUserById(id);
        if (!user.getUsername().equals(request.getUsername()) && userRepository.existsByUsername(request.getUsername())) {
            throw new BadRequestException("Username already exists");
        }
        if (!user.getEmail().equals(request.getEmail()) && userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already exists");
        }
        if (user.getId().equals(currentUser.getId()) && request.getRole() != user.getRole()) {
            throw new BadRequestException("You cannot change your own role");
        }

        Optional<Employee> employee = employeeRepository.findByUserId(user.getId());
        Long previousShopId = user.getShop() != null ? user.getShop().getId() : null;
        Shop shop = null;
        if (request.getRole() == Role.SUPER_ADMIN) {
            if (employee.isPresent()) {
                throw new BadRequestException("This user is registered as an employee, so they cannot be a super admin.");
            }
        } else if (request.getShopId() != null) {
            shop = request.getShopId().equals(previousShopId) ? user.getShop()
                    : shopRepository.findById(request.getShopId())
                            .filter(Shop::getActive)
                            .orElseThrow(() -> new BadRequestException("Select an active branch"));
        } else if (employee.isPresent()) {
            throw new BadRequestException("This user is an employee, so a branch is required.");
        }

        user.setUsername(request.getUsername());
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }
        user.setRole(request.getRole());
        user.setShop(shop);
        user.setStation(request.getRole() == Role.SHOP_OPERATOR ? request.getStation() : null);
        User saved = userRepository.save(user);

        if (employee.isPresent()) {
            employee.get().setShop(shop);
            employeeRepository.save(employee.get());
        }
        // Open queue screens reload, so a changed branch or station applies at once
        if (shop != null) {
            orderEventService.publishAfterCommit(shop.getId(), "STAFF", null);
        }
        if (previousShopId != null && (shop == null || !previousShopId.equals(shop.getId()))) {
            orderEventService.publishAfterCommit(previousShopId, "STAFF", null);
        }
        return toResponse(saved);
    }

    @Transactional
    public void toggleUserStatus(Long id) {
        User user = findUserById(id);
        user.setActive(!user.getActive());
        userRepository.save(user);
    }

    private void validateUserCreation(UserRequest request, UserPrincipal currentUser) {
        if (currentUser.getRole() == Role.SHOP_MANAGER) {
            // Shop manager can only create operators in their own shop
            if (request.getRole() != Role.SHOP_OPERATOR) {
                throw new UnauthorizedException("Shop managers can only create shop operators");
            }
            if (!currentUser.getShopId().equals(request.getShopId())) {
                throw new UnauthorizedException("Cannot create users for other shops");
            }
        }
    }

    private User findUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .phone(user.getPhone())
                .role(user.getRole())
                .shopId(user.getShop() != null ? user.getShop().getId() : null)
                .shopName(user.getShop() != null ? user.getShop().getName() : null)
                .active(user.getActive())
                .station(user.getStation())
                .build();
    }
}
