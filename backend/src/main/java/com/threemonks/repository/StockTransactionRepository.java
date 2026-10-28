package com.threemonks.repository;

import com.threemonks.entity.StockTransaction;
import com.threemonks.enums.StockTransactionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface StockTransactionRepository extends JpaRepository<StockTransaction, Long> {

    /**
     * One row per material per day, however many entries were made that day:
     * date, materialId, materialName, unitType, purchased, consumed, adjusted.
     */
    @Query("SELECT t.txnDate, t.rawMaterial.id, t.rawMaterial.name, t.rawMaterial.unitType, " +
           "SUM(CASE WHEN t.txnType = :purchase THEN t.quantityChange ELSE 0 END), " +
           "SUM(CASE WHEN t.txnType = :consumption THEN t.quantityChange ELSE 0 END), " +
           "SUM(CASE WHEN t.txnType = :adjustment THEN t.quantityChange ELSE 0 END) " +
           "FROM StockTransaction t " +
           "WHERE t.shop.id = :shopId AND t.txnDate BETWEEN :from AND :to " +
           "GROUP BY t.txnDate, t.rawMaterial.id, t.rawMaterial.name, t.rawMaterial.unitType " +
           "ORDER BY t.txnDate DESC, t.rawMaterial.name ASC")
    List<Object[]> getDailySummary(@Param("shopId") Long shopId,
                                   @Param("from") LocalDate from,
                                   @Param("to") LocalDate to,
                                   @Param("purchase") StockTransactionType purchase,
                                   @Param("consumption") StockTransactionType consumption,
                                   @Param("adjustment") StockTransactionType adjustment);

    /** Totals by material for one movement type, across all shops — used by analytics. */
    @Query("SELECT t.rawMaterial.name, t.rawMaterial.unitType, SUM(t.quantityChange) " +
           "FROM StockTransaction t " +
           "WHERE t.txnType = :type AND t.txnDate BETWEEN :from AND :to " +
           "GROUP BY t.rawMaterial.name, t.rawMaterial.unitType")
    List<Object[]> getMaterialUsageByType(@Param("type") StockTransactionType type,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to);

    List<StockTransaction> findByShopIdAndTxnDateOrderByCreatedAtDesc(Long shopId, LocalDate txnDate);

    /** The single row holding this day's figure, if one has been entered already. */
    Optional<StockTransaction> findByShopIdAndRawMaterialIdAndTxnDateAndTxnType(
            Long shopId, Long rawMaterialId, LocalDate txnDate, StockTransactionType txnType);
}
