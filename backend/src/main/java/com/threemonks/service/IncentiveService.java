package com.threemonks.service;

import com.threemonks.entity.Attendance;
import com.threemonks.entity.Employee;
import com.threemonks.entity.ManualDailySales;
import com.threemonks.entity.Shop;
import com.threemonks.enums.AttendanceStatus;
import com.threemonks.enums.Role;
import com.threemonks.repository.AttendanceRepository;
import com.threemonks.repository.EmployeeRepository;
import com.threemonks.repository.ManualDailySalesRepository;
import com.threemonks.repository.OrderRepository;
import com.threemonks.util.BusinessDay;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Staff sales incentive, per branch rule (Shops → Edit):
 * <pre>
 *   per person for a day = (shots + blends sold that day − free units) × ₹ per unit   (0 if not above)
 * </pre>
 * Every <b>operator</b> marked Present that day gets the full amount; Half day gets half;
 * Leave, Absent or not marked get nothing. It counts from the branch's start date, and an
 * admin can override a manual-sales day's per-person amount. Shots and blends come from
 * Manual Sales Entry and/or the day's app orders (cancelled left out).
 */
@Service
@RequiredArgsConstructor
public class IncentiveService {

    private static final BigDecimal HALF = new BigDecimal("0.5");

    private final ManualDailySalesRepository manualRepository;
    private final OrderRepository orderRepository;
    private final AttendanceRepository attendanceRepository;
    private final EmployeeRepository employeeRepository;

    public record DayIncentive(LocalDate date, long units, BigDecimal perPerson, boolean overridden) {
    }

    public record EmployeeIncentive(Long employeeId, String name, int presentDays, int halfDays, BigDecimal amount) {
    }

    public record MonthIncentive(boolean enabled, Integer freeUnits, BigDecimal perUnit, LocalDate startDate,
                                 List<DayIncentive> days, List<EmployeeIncentive> employees, BigDecimal total) {
    }

    /** Per person for one day from units sold, or the override when set; null when the incentive doesn't apply. */
    public static BigDecimal perPerson(Shop shop, LocalDate date, long units, BigDecimal override) {
        if (!shop.isIncentiveOn() || date.isBefore(shop.getIncentiveStartDate())) return null;
        if (override != null) return override;
        long above = Math.max(0, units - shop.getIncentiveFreeUnits());
        return shop.getIncentivePerUnit().multiply(BigDecimal.valueOf(above)).setScale(2, RoundingMode.HALF_UP);
    }

    /** A branch's month: per-day amount per person, and each operator's total from attendance. */
    @Transactional(readOnly = true)
    public MonthIncentive month(Shop shop, YearMonth month) {
        if (!shop.isIncentiveOn()) {
            return new MonthIncentive(false, null, null, null, List.of(), List.of(), BigDecimal.ZERO);
        }
        Map<LocalDate, DayIncentive> days = days(shop, month);
        Map<Long, int[]> counts = new LinkedHashMap<>();
        Map<Long, BigDecimal> amounts = new HashMap<>();
        Map<Long, String> names = new HashMap<>();
        // Every operator of the branch is listed, even with nothing yet
        for (Employee e : employeeRepository.findActiveByShopId(shop.getId())) {
            if (e.getUser().getRole() != Role.SHOP_OPERATOR) continue;
            counts.put(e.getId(), new int[2]);
            names.put(e.getId(), nameOf(e));
        }
        if (!days.isEmpty()) {
            LocalDate first = Collections.min(days.keySet()), last = Collections.max(days.keySet());
            for (Attendance a : attendanceRepository.findByShopIdAndAttendanceDateBetween(shop.getId(), first, last)) {
                Employee e = a.getEmployee();
                if (e.getUser().getRole() != Role.SHOP_OPERATOR) continue;
                DayIncentive d = days.get(a.getAttendanceDate());
                if (d == null) continue;
                BigDecimal share = share(a.getStatus(), d.perPerson());
                if (share == null) continue;
                counts.computeIfAbsent(e.getId(), k -> new int[2])[a.getStatus() == AttendanceStatus.PRESENT ? 0 : 1]++;
                names.putIfAbsent(e.getId(), nameOf(e));
                amounts.merge(e.getId(), share, BigDecimal::add);
            }
        }
        List<EmployeeIncentive> employees = new ArrayList<>();
        counts.forEach((id, c) -> employees.add(new EmployeeIncentive(id, names.get(id), c[0], c[1],
                amounts.getOrDefault(id, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP))));
        employees.sort(Comparator.comparing(EmployeeIncentive::name, String.CASE_INSENSITIVE_ORDER));
        BigDecimal total = employees.stream().map(EmployeeIncentive::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<DayIncentive> dayList = new ArrayList<>(days.values());
        dayList.sort(Comparator.comparing(DayIncentive::date).reversed());
        return new MonthIncentive(true, shop.getIncentiveFreeUnits(), shop.getIncentivePerUnit(),
                shop.getIncentiveStartDate(), dayList, employees, total);
    }

    /** One employee's incentive for a month (for the salary sheet); zero for non-operators. */
    @Transactional(readOnly = true)
    public BigDecimal forEmployee(Employee e, YearMonth month, Map<Long, Map<LocalDate, DayIncentive>> cache) {
        if (e.getUser().getRole() != Role.SHOP_OPERATOR) return BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        for (Attendance a : attendanceRepository.findByEmployeeIdAndAttendanceDateBetween(
                e.getId(), month.atDay(1), month.atEndOfMonth())) {
            Shop shop = a.getShop();
            if (!shop.isIncentiveOn()) continue;
            DayIncentive d = cache.computeIfAbsent(shop.getId(), k -> days(shop, month)).get(a.getAttendanceDate());
            BigDecimal share = d == null ? null : share(a.getStatus(), d.perPerson());
            if (share != null) total = total.add(share);
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    // Present = full, Half day = half, otherwise nothing
    private static BigDecimal share(AttendanceStatus status, BigDecimal perPerson) {
        if (perPerson == null) return null;
        if (status == AttendanceStatus.PRESENT) return perPerson;
        if (status == AttendanceStatus.HALF_DAY) return perPerson.multiply(HALF);
        return null;
    }

    // The incentive days of a month: from the start date (or the 1st) up to today
    private Map<LocalDate, DayIncentive> days(Shop shop, YearMonth month) {
        Map<LocalDate, DayIncentive> out = new TreeMap<>();
        if (!shop.isIncentiveOn()) return out;
        LocalDate from = month.atDay(1), to = month.atEndOfMonth(), today = BusinessDay.today();
        if (shop.getIncentiveStartDate().isAfter(from)) from = shop.getIncentiveStartDate();
        if (today.isBefore(to)) to = today;
        if (from.isAfter(to)) return out;

        Map<LocalDate, Long> units = new HashMap<>();
        Map<LocalDate, BigDecimal> overrides = new HashMap<>();
        for (ManualDailySales m : manualRepository.findByShopIdAndSalesDateBetweenOrderBySalesDateDesc(shop.getId(), from, to)) {
            units.merge(m.getSalesDate(), (long) (m.getShots() + m.getBlends()), Long::sum);
            if (m.getIncentiveOverride() != null) overrides.put(m.getSalesDate(), m.getIncentiveOverride());
        }
        for (Object[] row : orderRepository.getUnitsSoldBreakdown(BusinessDay.start(from), BusinessDay.end(to),
                BusinessDay.startHour())) {
            if (!shop.getId().equals(((Number) row[1]).longValue())) continue;
            LocalDate date = row[0] instanceof java.sql.Date d ? d.toLocalDate() : LocalDate.parse(String.valueOf(row[0]));
            units.merge(date, ((Number) row[3]).longValue(), Long::sum);
        }
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            long u = units.getOrDefault(d, 0L);
            BigDecimal override = overrides.get(d);
            out.put(d, new DayIncentive(d, u, perPerson(shop, d, u, override), override != null));
        }
        return out;
    }

    private static String nameOf(Employee e) {
        String full = e.getUser().getFullName();
        return full != null && !full.isBlank() ? full : e.getUser().getUsername();
    }
}
