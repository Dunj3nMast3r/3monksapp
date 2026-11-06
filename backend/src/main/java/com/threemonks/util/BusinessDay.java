package com.threemonks.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * The shop's business day: it runs from {@code app.business-day.start-hour}
 * (default 3 AM) India time to the same hour the next morning, so late-night
 * orders count towards the evening they belong to. Every "today", date filter,
 * per-day total, token number and report goes through here, so the whole app
 * agrees on which day an order belongs to.
 *
 * <p>Example with 3 AM: an order at 6 Nov 02:30 belongs to 5 Nov; "5 Nov" means
 * 5 Nov 03:00 up to (not including) 6 Nov 03:00.
 */
@Component
public class BusinessDay {

    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private static volatile int startHour = 3;

    public BusinessDay(@Value("${app.business-day.start-hour:3}") int configuredStartHour) {
        if (configuredStartHour < 0 || configuredStartHour > 12)
            throw new IllegalArgumentException("app.business-day.start-hour must be between 0 and 12");
        startHour = configuredStartHour;
    }

    /** Hour (0-12) at which a new business day starts. */
    public static int startHour() {
        return startHour;
    }

    /** Today's business date: before the start hour it is still the previous date. */
    public static LocalDate today() {
        return dateOf(LocalDateTime.now(ZONE));
    }

    /** The business date a moment (India time) belongs to. */
    public static LocalDate dateOf(LocalDateTime time) {
        return time.minusHours(startHour).toLocalDate();
    }

    /** First moment of a business date. */
    public static LocalDateTime start(LocalDate date) {
        return date.atTime(startHour, 0);
    }

    /** Last moment of a business date (one microsecond, the database precision, before the next one starts). */
    public static LocalDateTime end(LocalDate date) {
        return start(date.plusDays(1)).minusNanos(1_000);
    }
}
