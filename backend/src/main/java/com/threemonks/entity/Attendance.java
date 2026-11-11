package com.threemonks.entity;

import com.threemonks.enums.AttendanceStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * An employee's attendance on one business day, marked by a manager or admin.
 * One row per employee per day; a day with no row is "not marked". The branch
 * is kept as it was that day, so moving an employee later doesn't move history.
 */
@Entity
@Table(name = "attendance",
        uniqueConstraints = @UniqueConstraint(columnNames = {"employee_id", "attendance_date"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shop_id", nullable = false)
    private Shop shop;

    @Column(name = "attendance_date", nullable = false)
    private LocalDate attendanceDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AttendanceStatus status;

    @Column(length = 300)
    private String note;

    @Column(name = "marked_by")
    private String markedBy;

    @Column(name = "marked_at")
    private LocalDateTime markedAt;
}
