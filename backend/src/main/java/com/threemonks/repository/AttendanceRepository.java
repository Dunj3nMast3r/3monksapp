package com.threemonks.repository;

import com.threemonks.entity.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
    List<Attendance> findByShopIdAndAttendanceDate(Long shopId, LocalDate date);

    List<Attendance> findByShopIdAndAttendanceDateBetween(Long shopId, LocalDate from, LocalDate to);

    Optional<Attendance> findByEmployeeIdAndAttendanceDate(Long employeeId, LocalDate date);

    List<Attendance> findByEmployeeIdAndAttendanceDateBetween(Long employeeId, LocalDate from, LocalDate to);
}
