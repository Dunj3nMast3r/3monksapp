package com.threemonks.service;

import com.threemonks.entity.Attendance;
import com.threemonks.entity.Employee;
import com.threemonks.enums.AttendanceStatus;
import com.threemonks.repository.AttendanceRepository;
import com.threemonks.util.BusinessDay;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * Paid leave balance, per employee, worked out from attendance:
 * <ul>
 *   <li>Each month from the joining month, the branch's "paid leaves per month" is added.</li>
 *   <li>Each day marked Leave uses 1 (every day off, there is no separate weekly off); each Half day uses 0.5.</li>
 *   <li>Unused leave carries into the next month, at most {@value #MAX_CARRY} days. No yearly reset.</li>
 *   <li>Leave taken beyond the balance is "extra" for that month; it does not reduce later months.</li>
 * </ul>
 * Not tracked (null) when the employee's branch has no leaves per month set.
 */
@Service
@RequiredArgsConstructor
public class LeaveBalanceService {

    public static final int MAX_CARRY = 6;
    private static final BigDecimal HALF = new BigDecimal("0.5");
    private static final BigDecimal CAP = BigDecimal.valueOf(MAX_CARRY);

    private final AttendanceRepository attendanceRepository;

    /** One month of an employee's leave. balance = what's left (never below 0); extra = taken beyond it. */
    public record MonthLeave(BigDecimal opening, BigDecimal allocated, BigDecimal used,
                             BigDecimal balance, BigDecimal extra) {
    }

    /** The month's leave, or null when not tracked or the month is before they joined. */
    @Transactional(readOnly = true)
    public MonthLeave forMonth(Employee e, YearMonth month) {
        BigDecimal perMonth = e.getShop().getMonthlyLeaves();
        if (perMonth == null || perMonth.signum() <= 0) return null;
        LocalDate joined = e.effectiveJoinDate();
        YearMonth first = YearMonth.from(joined);
        if (month.isBefore(first)) return null;

        List<Attendance> marks = attendanceRepository.findByEmployeeIdAndAttendanceDateBetween(
                e.getId(), first.atDay(1), month.atEndOfMonth());
        BigDecimal carry = BigDecimal.ZERO;
        MonthLeave result = null;
        for (YearMonth m = first; !m.isAfter(month); m = m.plusMonths(1)) {
            YearMonth mm = m;
            BigDecimal used = marks.stream()
                    .filter(a -> YearMonth.from(a.getAttendanceDate()).equals(mm))
                    .map(a -> a.getStatus() == AttendanceStatus.LEAVE ? BigDecimal.ONE
                            : a.getStatus() == AttendanceStatus.HALF_DAY ? HALF : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal closing = carry.add(perMonth).subtract(used);
            result = new MonthLeave(carry, perMonth, used,
                    closing.max(BigDecimal.ZERO), closing.negate().max(BigDecimal.ZERO));
            carry = closing.max(BigDecimal.ZERO).min(CAP);
        }
        return result;
    }

    /** What's left this month (business month), or null when not tracked. */
    @Transactional(readOnly = true)
    public BigDecimal balanceNow(Employee e) {
        MonthLeave m = forMonth(e, YearMonth.from(BusinessDay.today()));
        return m == null ? null : m.balance();
    }
}
