package com.threemonks.service;

import com.threemonks.dto.AttendanceDayResponse;
import com.threemonks.dto.AttendanceMonthResponse;
import com.threemonks.dto.AttendanceRequest;
import com.threemonks.entity.Attendance;
import com.threemonks.entity.Employee;
import com.threemonks.entity.Shop;
import com.threemonks.enums.AttendanceStatus;
import com.threemonks.enums.Role;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.exception.UnauthorizedException;
import com.threemonks.repository.AttendanceRepository;
import com.threemonks.repository.EmployeeRepository;
import com.threemonks.repository.ShopRepository;
import com.threemonks.security.UserPrincipal;
import com.threemonks.util.BusinessDay;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Staff attendance: a manager (own branch) or admin (any branch) marks each
 * employee Present / Half day / Leave / Absent / Week off per business day.
 * A day with no mark is "not marked". Leave and week off can be marked ahead
 * (planned); the other statuses only for today or earlier. Records only, no pay effect.
 */
@Service
@RequiredArgsConstructor
public class AttendanceService {

    private static final Set<AttendanceStatus> PLANNABLE = EnumSet.of(AttendanceStatus.LEAVE, AttendanceStatus.WEEK_OFF);

    private final AttendanceRepository attendanceRepository;
    private final EmployeeRepository employeeRepository;
    private final ShopRepository shopRepository;
    private final LeaveBalanceService leaveBalanceService;

    @Transactional(readOnly = true)
    public AttendanceDayResponse getDay(Long shopId, LocalDate date, UserPrincipal user) {
        Shop shop = accessibleShop(shopId, user);
        LocalDate day = date != null ? date : BusinessDay.today();
        Map<Long, Attendance> marks = attendanceRepository.findByShopIdAndAttendanceDate(shop.getId(), day).stream()
                .collect(Collectors.toMap(a -> a.getEmployee().getId(), a -> a));

        // Everyone working here now, plus anyone who has since left but was marked that day
        Map<Long, Employee> people = new LinkedHashMap<>();
        employeeRepository.findActiveByShopId(shop.getId()).forEach(e -> people.put(e.getId(), e));
        marks.values().forEach(a -> people.putIfAbsent(a.getEmployee().getId(), a.getEmployee()));

        List<AttendanceDayResponse.Row> rows = people.values().stream()
                .map(e -> {
                    Attendance a = marks.get(e.getId());
                    return AttendanceDayResponse.Row.builder()
                            .employeeId(e.getId())
                            .name(nameOf(e))
                            .role(roleOf(e))
                            .status(a == null ? null : a.getStatus())
                            .note(a == null ? null : a.getNote())
                            .markedBy(a == null ? null : a.getMarkedBy())
                            .markedAt(a == null ? null : a.getMarkedAt())
                            .active(Boolean.TRUE.equals(e.getActive()) && e.getShop().getId().equals(shop.getId()))
                            .leaveBalance(leaveBalanceService.forMonth(e, java.time.YearMonth.from(day)))
                            .build();
                })
                .sorted(Comparator.comparing(AttendanceDayResponse.Row::getName, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
        return AttendanceDayResponse.builder()
                .shopId(shop.getId()).shopName(shop.getName()).date(day).employees(rows)
                .monthlyLeaves(shop.getMonthlyLeaves())
                .build();
    }

    /** Saves the register for one branch and day. A null status clears that employee's mark. */
    @Transactional
    public void saveDay(AttendanceRequest request, UserPrincipal user) {
        Shop shop = accessibleShop(request.getShopId(), user);
        LocalDate day = request.getDate();
        boolean future = day.isAfter(BusinessDay.today());
        LocalDateTime now = LocalDateTime.now(BusinessDay.ZONE);

        Set<Long> seen = new HashSet<>();
        for (AttendanceRequest.Entry entry : request.getEntries()) {
            if (!seen.add(entry.getEmployeeId())) {
                throw new BadRequestException("The same employee appears twice");
            }
            Optional<Attendance> existing = attendanceRepository.findByEmployeeIdAndAttendanceDate(entry.getEmployeeId(), day);
            Employee employee = employeeRepository.findById(entry.getEmployeeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", entry.getEmployeeId()));
            // Only this branch's staff (or someone already marked here that day)
            boolean belongsHere = employee.getShop().getId().equals(shop.getId())
                    || existing.map(a -> a.getShop().getId().equals(shop.getId())).orElse(false);
            if (!belongsHere) {
                throw new BadRequestException(nameOf(employee) + " doesn't work at " + shop.getName());
            }
            if (entry.getStatus() == null) {
                existing.ifPresent(attendanceRepository::delete);
                continue;
            }
            if (future && !PLANNABLE.contains(entry.getStatus())) {
                throw new BadRequestException("Only Leave or Week off can be marked for a future date (" + nameOf(employee) + ")");
            }
            Attendance a = existing.orElseGet(() -> Attendance.builder()
                    .employee(employee).shop(shop).attendanceDate(day).build());
            String note = entry.getNote() == null ? "" : entry.getNote().trim();
            boolean changed = a.getId() == null || a.getStatus() != entry.getStatus()
                    || !Objects.equals(a.getNote(), note.isEmpty() ? null : note);
            if (!changed) continue;
            a.setStatus(entry.getStatus());
            a.setNote(note.isEmpty() ? null : note);
            a.setMarkedBy(user.getUsername());
            a.setMarkedAt(now);
            attendanceRepository.save(a);
        }
    }

    @Transactional(readOnly = true)
    public AttendanceMonthResponse getMonth(Long shopId, String month, UserPrincipal user) {
        Shop shop = accessibleShop(shopId, user);
        YearMonth ym;
        try {
            ym = month == null || month.isBlank() ? YearMonth.from(BusinessDay.today()) : YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new BadRequestException("Month must look like 2026-11");
        }
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();
        LocalDate today = BusinessDay.today();
        LocalDate lastDue = to.isAfter(today) ? today : to;

        List<Attendance> marks = attendanceRepository.findByShopIdAndAttendanceDateBetween(shop.getId(), from, to);
        Map<Long, Employee> people = new LinkedHashMap<>();
        employeeRepository.findActiveByShopId(shop.getId()).forEach(e -> people.put(e.getId(), e));
        marks.forEach(a -> people.putIfAbsent(a.getEmployee().getId(), a.getEmployee()));
        Map<Long, List<Attendance>> byEmployee = marks.stream().collect(Collectors.groupingBy(a -> a.getEmployee().getId()));

        List<AttendanceMonthResponse.Row> rows = new ArrayList<>();
        for (Employee e : people.values()) {
            Map<LocalDate, AttendanceStatus> days = new TreeMap<>();
            byEmployee.getOrDefault(e.getId(), List.of()).forEach(a -> days.put(a.getAttendanceDate(), a.getStatus()));
            Map<AttendanceStatus, Integer> counts = new EnumMap<>(AttendanceStatus.class);
            days.values().forEach(s -> counts.merge(s, 1, Integer::sum));

            // Days that should have a mark: from the later of the 1st and the day they joined, up to today
            LocalDate joined = e.effectiveJoinDate();
            LocalDate start = joined.isAfter(from) ? joined : from;
            int notMarked = 0;
            boolean stillHere = Boolean.TRUE.equals(e.getActive()) && e.getShop().getId().equals(shop.getId());
            if (stillHere) {
                for (LocalDate d = start; !d.isAfter(lastDue); d = d.plusDays(1)) {
                    if (!days.containsKey(d)) notMarked++;
                }
            }
            rows.add(AttendanceMonthResponse.Row.builder()
                    .employeeId(e.getId()).name(nameOf(e)).role(roleOf(e))
                    .present(counts.getOrDefault(AttendanceStatus.PRESENT, 0))
                    .halfDay(counts.getOrDefault(AttendanceStatus.HALF_DAY, 0))
                    .leave(counts.getOrDefault(AttendanceStatus.LEAVE, 0))
                    .absent(counts.getOrDefault(AttendanceStatus.ABSENT, 0))
                    .weekOff(counts.getOrDefault(AttendanceStatus.WEEK_OFF, 0))
                    .notMarked(notMarked)
                    .leaveBalance(leaveBalanceService.forMonth(e, ym))
                    .markFrom(stillHere ? start : null)
                    .days(days)
                    .build());
        }
        rows.sort(Comparator.comparing(AttendanceMonthResponse.Row::getName, String.CASE_INSENSITIVE_ORDER));
        return AttendanceMonthResponse.builder()
                .shopId(shop.getId()).shopName(shop.getName()).month(ym.toString())
                .from(from).to(to)
                .monthlyLeaves(shop.getMonthlyLeaves())
                .daysSoFar(lastDue.isBefore(from) ? 0 : (int) (lastDue.toEpochDay() - from.toEpochDay() + 1))
                .employees(rows)
                .build();
    }

    /** Branches this user may mark: admins all active ones, a manager their own. */
    @Transactional(readOnly = true)
    public List<Shop> shopsFor(UserPrincipal user) {
        if (user.getRole() == Role.SUPER_ADMIN) {
            return shopRepository.findByActiveTrue().stream()
                    .sorted(Comparator.comparing(Shop::getName)).collect(Collectors.toList());
        }
        return user.getShopId() == null ? List.of()
                : shopRepository.findById(user.getShopId()).map(List::of).orElse(List.of());
    }

    private Shop accessibleShop(Long shopId, UserPrincipal user) {
        if (shopId == null) throw new BadRequestException("Branch is required");
        if (user.getRole() != Role.SUPER_ADMIN && !shopId.equals(user.getShopId())) {
            throw new UnauthorizedException("You can only mark attendance for your own branch");
        }
        return shopRepository.findById(shopId).orElseThrow(() -> new ResourceNotFoundException("Shop", "id", shopId));
    }

    private static String nameOf(Employee e) {
        String full = e.getUser().getFullName();
        return full != null && !full.isBlank() ? full : e.getUser().getUsername();
    }

    private static String roleOf(Employee e) {
        return switch (e.getUser().getRole()) {
            case SUPER_ADMIN -> "Admin";
            case SHOP_MANAGER -> "Manager";
            case SHOP_OPERATOR -> "Staff";
        };
    }
}
