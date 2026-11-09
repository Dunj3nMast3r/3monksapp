package com.threemonks.repository;

import com.threemonks.entity.ManualDailySales;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ManualDailySalesRepository extends JpaRepository<ManualDailySales, Long> {
    Optional<ManualDailySales> findByShopIdAndSalesDate(Long shopId, LocalDate salesDate);

    List<ManualDailySales> findBySalesDateBetween(LocalDate from, LocalDate to);

    List<ManualDailySales> findByShopIdAndSalesDateBetweenOrderBySalesDateDesc(Long shopId, LocalDate from, LocalDate to);
}
