package com.threemonks.repository;

import com.threemonks.entity.CollectionActual;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CollectionActualRepository extends JpaRepository<CollectionActual, Long> {
    Optional<CollectionActual> findByShopIdAndCollectionDate(Long shopId, LocalDate collectionDate);

    List<CollectionActual> findByCollectionDateBetween(LocalDate from, LocalDate to);
}
