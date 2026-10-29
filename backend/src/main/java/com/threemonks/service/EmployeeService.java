package com.threemonks.service;

import com.threemonks.dto.EmployeeRequest;
import com.threemonks.dto.EmployeeResponse;
import com.threemonks.dto.SalarySheetResponse;
import com.threemonks.entity.Employee;
import com.threemonks.entity.Shop;
import com.threemonks.entity.User;
import com.threemonks.enums.Role;
import com.threemonks.enums.Station;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.exception.UnauthorizedException;
import com.threemonks.repository.EmployeeRepository;
import com.threemonks.repository.OrderRepository;
import com.threemonks.repository.ShopRepository;
import com.threemonks.repository.UserRepository;
import com.threemonks.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final UserRepository userRepository;
    private final ShopRepository shopRepository;
    private final OrderRepository orderRepository;
    private final OrderEventService orderEventService;

    public List<EmployeeResponse> getAllEmployees() {
        return employeeRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<EmployeeResponse> getEmployeesByShop(Long shopId) {
        return employeeRepository.findByShopId(shopId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public EmployeeResponse getEmployeeById(Long id) {
        return toResponse(findById(id));
    }

    // Registers a person at a shop. The login's shop, role and station follow the
    // employee record, so access and payroll always agree on where someone works.
    @Transactional
    public EmployeeResponse createEmployee(EmployeeRequest request) {
        if (request.getUserId() == null) {
            throw new BadRequestException("Please select a user");
        }
        if (employeeRepository.existsByUserId(request.getUserId())) {
            throw new BadRequestException(
                    "This user is already registered as an employee. Please select a different user.");
        }
        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new BadRequestException("Selected user not found. Please refresh and try again."));
        if (!user.getActive()) {
            throw new BadRequestException("Cannot add inactive user as employee. Please activate the user first.");
        }
        if (user.getRole() == Role.SUPER_ADMIN) {
            throw new BadRequestException("A super admin cannot be registered as a shop employee.");
        }
        Shop shop = findActiveShop(request.getShopId());
        validateRole(request.getRole());
        applyAssignment(user, shop, request.getRole(), request.getStation());
        userRepository.save(user);

        Employee employee = Employee.builder()
                .user(user)
                .shop(shop)
                .salary(request.getSalary())
                .incentivePercentage(
                        request.getIncentivePercentage() != null ? request.getIncentivePercentage() : BigDecimal.ZERO)
                .active(true)
                .build();

        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public EmployeeResponse updateEmployee(Long id, EmployeeRequest request) {
        Employee employee = findById(id);
        Long previousShopId = employee.getShop().getId();
        Shop shop = employee.getShop().getId().equals(request.getShopId())
                ? employee.getShop()
                : findActiveShop(request.getShopId());
        validateRole(request.getRole());

        employee.setShop(shop);
        employee.setSalary(request.getSalary());
        if (request.getIncentivePercentage() != null) {
            employee.setIncentivePercentage(request.getIncentivePercentage());
        }
        User user = employee.getUser();
        applyAssignment(user, shop, request.getRole(), request.getStation());
        userRepository.save(user);
        // Open queue screens reload, so a changed station or shop applies at once
        orderEventService.publishAfterCommit(shop.getId(), "STAFF", null);
        if (!previousShopId.equals(shop.getId())) {
            orderEventService.publishAfterCommit(previousShopId, "STAFF", null);
        }
        return toResponse(employeeRepository.save(employee));
    }

    private void applyAssignment(User user, Shop shop, Role role, Station station) {
        user.setShop(shop);
        user.setRole(role);
        user.setStation(role == Role.SHOP_OPERATOR ? station : null);
    }

    private void validateRole(Role role) {
        if (role != Role.SHOP_MANAGER && role != Role.SHOP_OPERATOR) {
            throw new BadRequestException("Employees must be a shop manager or a shop operator.");
        }
    }

    private Shop findActiveShop(Long shopId) {
        Shop shop = shopRepository.findById(shopId)
                .orElseThrow(() -> new BadRequestException("Selected shop not found. Please refresh and try again."));
        if (!shop.getActive()) {
            throw new BadRequestException("Cannot assign employee to an inactive shop. Please select an active shop.");
        }
        return shop;
    }

    @Transactional
    public void toggleEmployeeStatus(Long id) {
        Employee employee = findById(id);
        employee.setActive(!employee.getActive());
        employeeRepository.save(employee);
    }

    public SalarySheetResponse.MonthlySummary getMonthlySalarySheet(Long shopId, String monthStr) {
        YearMonth month = YearMonth.parse(monthStr, DateTimeFormatter.ofPattern("yyyy-MM"));
        LocalDateTime monthStart = month.atDay(1).atStartOfDay();
        LocalDateTime monthEnd = month.atEndOfMonth().atTime(LocalTime.MAX);

        List<Employee> employees;
        if (shopId != null) {
            employees = employeeRepository.findActiveByShopId(shopId);
        } else {
            employees = employeeRepository.findByActiveTrue();
        }

        List<SalarySheetResponse> sheets = employees.stream().map(emp -> {
            // Get total sales handled by this employee in the month
            BigDecimal totalSales = Optional.ofNullable(
                    orderRepository.getTotalSalesByUserAndDateRange(emp.getUser().getId(), monthStart, monthEnd))
                    .orElse(BigDecimal.ZERO);

            Long totalOrders = Optional.ofNullable(
                    orderRepository.getOrderCountByUserAndDateRange(emp.getUser().getId(), monthStart, monthEnd))
                    .orElse(0L);

            // Incentive = Total Sales * Incentive %
            BigDecimal incentiveRate = emp.getIncentivePercentage() != null ? emp.getIncentivePercentage()
                    : BigDecimal.ZERO;
            BigDecimal incentiveAmount = totalSales.multiply(incentiveRate).divide(BigDecimal.valueOf(100), 2,
                    RoundingMode.HALF_UP);

            // Total Pay = Salary + Incentive
            BigDecimal totalPay = emp.getSalary().add(incentiveAmount);

            return SalarySheetResponse.builder()
                    .employeeId(emp.getId())
                    .fullName(emp.getUser().getFullName())
                    .shopName(emp.getShop().getName())
                    .baseSalary(emp.getSalary())
                    .incentivePercentage(incentiveRate)
                    .totalSalesHandled(totalSales)
                    .totalOrders(totalOrders)
                    .incentiveAmount(incentiveAmount)
                    .totalPay(totalPay)
                    .month(monthStr)
                    .build();
        }).collect(Collectors.toList());

        BigDecimal totalSalaries = sheets.stream().map(SalarySheetResponse::getBaseSalary).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        BigDecimal totalIncentives = sheets.stream().map(SalarySheetResponse::getIncentiveAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return SalarySheetResponse.MonthlySummary.builder()
                .month(monthStr)
                .employees(sheets)
                .totalSalaries(totalSalaries)
                .totalIncentives(totalIncentives)
                .grandTotal(totalSalaries.add(totalIncentives))
                .build();
    }

    private Employee findById(Long id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", id));
    }

    private EmployeeResponse toResponse(Employee emp) {
        return EmployeeResponse.builder()
                .id(emp.getId())
                .userId(emp.getUser().getId())
                .userName(emp.getUser().getUsername())
                .fullName(emp.getUser().getFullName())
                .email(emp.getUser().getEmail())
                .phone(emp.getUser().getPhone())
                .role(emp.getUser().getRole().name())
                .shopId(emp.getShop().getId())
                .station(emp.getUser().getStation())
                .shopName(emp.getShop().getName())
                .salary(emp.getSalary())
                .incentivePercentage(emp.getIncentivePercentage())
                .active(emp.getActive())
                .build();
    }
}
