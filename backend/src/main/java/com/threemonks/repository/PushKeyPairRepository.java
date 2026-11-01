package com.threemonks.repository;

import com.threemonks.entity.PushKeyPair;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushKeyPairRepository extends JpaRepository<PushKeyPair, Long> {
}
