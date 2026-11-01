package com.threemonks.repository;

import com.threemonks.entity.Stock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StockRepository extends JpaRepository<Stock, Long> {
    List<Stock> findByShopId(Long shopId);
    Optional<Stock> findByShopIdAndRawMaterialId(Long shopId, Long rawMaterialId);

    /**
     * Same lookup, but locks the row for the rest of the transaction. Stock writes
     * are read-modify-write, so without this two concurrent entries can both pass
     * the "must not go negative" check and leave a negative balance.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Stock s WHERE s.shop.id = :shopId AND s.rawMaterial.id = :rawMaterialId")
    Optional<Stock> findForUpdate(@Param("shopId") Long shopId, @Param("rawMaterialId") Long rawMaterialId);

    @Query("SELECT s FROM Stock s WHERE s.shop.id = :shopId AND s.quantity <= s.minimumThreshold")
    List<Stock> findLowStockByShopId(@Param("shopId") Long shopId);

    @Query("SELECT s FROM Stock s WHERE s.quantity <= s.minimumThreshold")
    List<Stock> findAllLowStock();
}
