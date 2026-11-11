package com.threemonks.enums;

/** One employee's attendance on one business day. */
public enum AttendanceStatus {
    PRESENT,
    HALF_DAY,
    LEAVE,
    ABSENT
    // No separate weekly off: every day off is Leave and uses the branch's monthly allowance
}
