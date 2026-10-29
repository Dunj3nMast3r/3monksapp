package com.threemonks.repository;

import com.threemonks.entity.PushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, Long> {

    Optional<PushSubscription> findByEndpoint(String endpoint);

    @Query("SELECT s FROM PushSubscription s JOIN FETCH s.user u LEFT JOIN FETCH u.shop LEFT JOIN FETCH s.shop WHERE u.active = true")
    List<PushSubscription> findAllOfActiveUsers();
}
