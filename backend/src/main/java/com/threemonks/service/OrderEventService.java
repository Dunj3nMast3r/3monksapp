package com.threemonks.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Pushes "orders changed" events to open Order Queue screens of a shop over
 * server-sent events, so station alerts fire as soon as an order changes.
 * Events carry no order details; screens reload the queue through the normal API.
 * Connections live in memory, which suits the single backend instance.
 */
@Service
public class OrderEventService {

    // Clients reconnect when a stream ends, so a finite timeout just recycles connections
    private static final long STREAM_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(30);
    // Below nginx's 60s proxy_read_timeout, so idle streams are not cut
    private static final long HEARTBEAT_SECONDS = 25;

    private final Map<Long, Set<SseEmitter>> emittersByShop = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "order-events-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    @PostConstruct
    void startHeartbeat() {
        heartbeat.scheduleAtFixedRate(this::sendHeartbeat, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stopHeartbeat() {
        heartbeat.shutdownNow();
        emittersByShop.values().forEach(emitters -> emitters.forEach(SseEmitter::complete));
    }

    public SseEmitter subscribe(Long shopId) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        emittersByShop.computeIfAbsent(shopId, id -> ConcurrentHashMap.newKeySet()).add(emitter);
        emitter.onCompletion(() -> remove(emitter));
        emitter.onTimeout(() -> remove(emitter));
        emitter.onError(error -> remove(emitter));
        // Sent right away so the client knows the stream is open
        send(emitter, SseEmitter.event().name("ready").data("{}", MediaType.APPLICATION_JSON));
        return emitter;
    }

    // Publishes once the current transaction commits, so screens never reload before the change is saved
    public void publishAfterCommit(Long shopId, String type, Long orderId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish(shopId, type, orderId);
                }
            });
        } else {
            publish(shopId, type, orderId);
        }
    }

    // orderId is null for events not about one order (e.g. staff changes)
    private void publish(Long shopId, String type, Long orderId) {
        Set<SseEmitter> emitters = emittersByShop.get(shopId);
        if (emitters == null) {
            return;
        }
        String data = "{\"type\":\"" + type + "\",\"orderId\":" + orderId + "}";
        emitters.forEach(emitter -> send(emitter, SseEmitter.event().name("order").data(data, MediaType.APPLICATION_JSON)));
    }

    private void sendHeartbeat() {
        emittersByShop.values().forEach(emitters -> emitters.forEach(emitter -> send(emitter, SseEmitter.event().comment("ping"))));
    }

    private void send(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            // Client went away; the servlet container cleans up the request, so just drop it
            remove(emitter);
        }
    }

    private void remove(SseEmitter emitter) {
        emittersByShop.values().forEach(emitters -> emitters.remove(emitter));
    }
}
