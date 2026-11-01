package com.threemonks.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.threemonks.dto.PushSubscriptionRequest;
import com.threemonks.entity.*;
import com.threemonks.enums.OrderStatus;
import com.threemonks.enums.Role;
import com.threemonks.enums.Station;
import com.threemonks.enums.StationStatus;
import com.threemonks.exception.BadRequestException;
import com.threemonks.repository.*;
import com.threemonks.security.UserPrincipal;
import com.threemonks.service.push.WebPushSender;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * Phone notifications (Web Push) for the order queue, delivered even when the app is
 * closed or the device is locked: a new order for the device's station, and a one-time
 * reminder when an order has waited too long. Devices get the same orders their queue
 * screen would alert on.
 */
@Service
public class PushNotificationService {

    private static final Logger logger = LoggerFactory.getLogger(PushNotificationService.class);

    private static final int REMINDER_MINUTES = 5;
    // Older orders (e.g. forgotten at closing time) get no reminder
    private static final int REMINDER_WINDOW_MINUTES = 60;
    private static final int TTL_SECONDS = 600;
    private static final String QUEUE_URL = "/dashboard/orders/queue";
    private static final long KEY_ID = 1L;

    private final PushKeyPairRepository keyRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final ShopRepository shopRepository;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final String subject;
    private final boolean allowInsecureEndpoints;
    private final ExecutorService executor = Executors.newFixedThreadPool(2, r -> {
        Thread thread = new Thread(r, "push-notifications");
        thread.setDaemon(true);
        return thread;
    });
    private WebPushSender sender;

    public PushNotificationService(PushKeyPairRepository keyRepository,
                                   PushSubscriptionRepository subscriptionRepository,
                                   OrderRepository orderRepository,
                                   UserRepository userRepository,
                                   ShopRepository shopRepository,
                                   ObjectMapper objectMapper,
                                   PlatformTransactionManager transactionManager,
                                   @Value("${app.push.subject}") String subject,
                                   @Value("${app.push.allow-insecure-endpoints:false}") boolean allowInsecureEndpoints) {
        this.keyRepository = keyRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.shopRepository = shopRepository;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.subject = subject;
        this.allowInsecureEndpoints = allowInsecureEndpoints;
    }

    @PostConstruct
    void init() throws Exception {
        sender = new WebPushSender(loadOrCreateKeys(), subject);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    public String getPublicKey() {
        return sender.publicKeyBase64Url();
    }

    // Registers the device, or updates it when it switches station view or user
    public void subscribe(PushSubscriptionRequest request, UserPrincipal currentUser) {
        URI uri;
        try {
            uri = URI.create(request.getEndpoint());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid push endpoint");
        }
        boolean secure = "https".equals(uri.getScheme());
        if (!secure && !(allowInsecureEndpoints && "http".equals(uri.getScheme()))) {
            throw new BadRequestException("Push endpoint must use https");
        }
        transactionTemplate.executeWithoutResult(status -> {
            User user = userRepository.findById(currentUser.getId())
                    .orElseThrow(() -> new BadRequestException("User not found"));
            PushSubscription subscription = subscriptionRepository.findByEndpoint(request.getEndpoint())
                    .orElseGet(PushSubscription::new);
            subscription.setEndpoint(request.getEndpoint());
            subscription.setP256dh(request.getKeys().getP256dh());
            subscription.setAuth(request.getKeys().getAuth());
            subscription.setUser(user);
            subscription.setShop(user.getRole() == Role.SUPER_ADMIN ? adminViewShop(request.getShopId()) : user.getShop());
            subscription.setStation(request.getStation());
            subscription.setUpdatedAt(LocalDateTime.now());
            subscriptionRepository.save(subscription);
        });
    }

    public void unsubscribe(String endpoint, UserPrincipal currentUser) {
        transactionTemplate.executeWithoutResult(status ->
                subscriptionRepository.findByEndpoint(endpoint)
                        .filter(s -> s.getUser().getId().equals(currentUser.getId()))
                        .ifPresent(subscriptionRepository::delete));
    }

    // Called inside the order's transaction; sends once it commits, off the request thread
    public void notifyNewOrderAfterCommit(Long orderId) {
        Runnable send = () -> executor.submit(() -> sendForOrder(orderId, false));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }

    // Marks due orders first, so each gets at most one reminder even across restarts
    @Scheduled(initialDelay = 30_000, fixedDelay = 30_000)
    public void sendReminders() {
        LocalDateTime now = LocalDateTime.now();
        List<Long> due = transactionTemplate.execute(status -> {
            List<Order> orders = orderRepository.findDueForReminder(
                    now.minusMinutes(REMINDER_WINDOW_MINUTES), now.minusMinutes(REMINDER_MINUTES));
            orders.forEach(order -> order.setReminderSentAt(now));
            orderRepository.saveAll(orders);
            return orders.stream().map(Order::getId).collect(Collectors.toList());
        });
        if (due != null) {
            due.forEach(id -> sendForOrder(id, true));
        }
    }

    private void sendForOrder(Long orderId, boolean reminder) {
        try {
            List<Message> messages = transactionTemplate.execute(status -> buildMessages(orderId, reminder));
            if (messages != null) {
                messages.forEach(this::deliver);
            }
        } catch (Exception e) {
            logger.warn("Push notifications for order {} failed: {}", orderId, e.getMessage());
        }
    }

    private List<Message> buildMessages(Long orderId, boolean reminder) {
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null || order.getStatus() != OrderStatus.PENDING) {
            return List.of();
        }
        List<Message> messages = new ArrayList<>();
        for (PushSubscription subscription : subscriptionRepository.findAllOfActiveUsers()) {
            if (!order.getShop().getId().equals(effectiveShopId(subscription))) continue;
            Station station = effectiveStation(subscription);
            if (station != null && OrderService.stationStatus(order, station) != StationStatus.PENDING) continue;

            List<OrderItem> items = order.getItems().stream()
                    .filter(item -> station == null || OrderService.belongsTo(item.getProduct(), station))
                    .collect(Collectors.toList());
            messages.add(new Message(subscription.getId(), subscription.getEndpoint(), subscription.getP256dh(),
                    subscription.getAuth(), payload(order, items, reminder)));
        }
        return messages;
    }

    private String payload(Order order, List<OrderItem> items, boolean reminder) {
        String itemText = items.stream()
                .map(item -> item.getQuantity() + "× " + (item.getCustomization() != null
                        ? item.getCustomization() : item.getProduct().getName()))
                .collect(Collectors.joining(", "));
        if (Boolean.TRUE.equals(order.getParcel())) {
            itemText += " · 🛍️ Parcel";
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", reminder
                ? "⏰ Order #" + order.getTokenNumber() + " waiting over " + REMINDER_MINUTES + " min"
                : "🔔 New order #" + order.getTokenNumber());
        body.put("body", itemText);
        body.put("tag", "order-" + order.getId() + (reminder ? "-reminder" : ""));
        body.put("url", QUEUE_URL);
        try {
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void deliver(Message message) {
        try {
            int status = sender.send(message.endpoint(), message.p256dh(), message.auth(), message.payload(), TTL_SECONDS);
            if (status == 404 || status == 410) {
                // Device unsubscribed or app removed
                transactionTemplate.executeWithoutResult(s -> subscriptionRepository.deleteById(message.subscriptionId()));
            } else if (status >= 400) {
                logger.warn("Push service answered {} for subscription {}", status, message.subscriptionId());
            }
        } catch (Exception e) {
            logger.warn("Push to subscription {} failed: {}", message.subscriptionId(), e.getMessage());
        }
    }

    // Admins have no shop; their device follows the shop it was registered for
    private Long effectiveShopId(PushSubscription subscription) {
        User user = subscription.getUser();
        Shop shop = user.getRole() == Role.SUPER_ADMIN ? subscription.getShop() : user.getShop();
        return shop != null ? shop.getId() : null;
    }

    private Station effectiveStation(PushSubscription subscription) {
        User user = subscription.getUser();
        if (user.getRole() == Role.SHOP_OPERATOR && user.getStation() != null) {
            return user.getStation();
        }
        return subscription.getStation();
    }

    // Same choice the queue screen makes for an admin: the requested shop, else the first active one
    private Shop adminViewShop(Long shopId) {
        if (shopId != null) {
            return shopRepository.findById(shopId).orElseThrow(() -> new BadRequestException("Shop not found"));
        }
        return shopRepository.findByActiveTrue().stream().findFirst()
                .orElseThrow(() -> new BadRequestException("No active shops"));
    }

    private KeyPair loadOrCreateKeys() throws Exception {
        PushKeyPair stored = transactionTemplate.execute(status -> keyRepository.findById(KEY_ID).orElseGet(() -> {
            try {
                KeyPair generated = WebPushSender.generateKeyPair();
                Base64.Encoder encoder = Base64.getEncoder();
                return keyRepository.save(PushKeyPair.builder()
                        .id(KEY_ID)
                        .publicKey(encoder.encodeToString(generated.getPublic().getEncoded()))
                        .privateKey(encoder.encodeToString(generated.getPrivate().getEncoded()))
                        .createdAt(LocalDateTime.now())
                        .build());
            } catch (Exception e) {
                throw new IllegalStateException("Could not create push keys", e);
            }
        }));
        KeyFactory factory = KeyFactory.getInstance("EC");
        Base64.Decoder decoder = Base64.getDecoder();
        return new KeyPair(
                factory.generatePublic(new X509EncodedKeySpec(decoder.decode(stored.getPublicKey()))),
                factory.generatePrivate(new PKCS8EncodedKeySpec(decoder.decode(stored.getPrivateKey()))));
    }

    private record Message(Long subscriptionId, String endpoint, String p256dh, String auth, String payload) {
    }
}
