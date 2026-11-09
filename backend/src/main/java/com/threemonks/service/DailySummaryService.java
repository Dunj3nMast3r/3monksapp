package com.threemonks.service;

import com.threemonks.util.BusinessDay;
import com.threemonks.dto.DailyCollectionResponse.CollectionRow;
import com.threemonks.dto.StockReportResponse;
import com.threemonks.dto.StockResponse;
import com.threemonks.entity.Order;
import com.threemonks.entity.Shop;
import com.threemonks.enums.OrderStatus;
import com.threemonks.enums.PaymentMode;
import com.threemonks.enums.ProductCategory;
import com.threemonks.exception.BadRequestException;
import com.threemonks.repository.OrderRepository;
import com.threemonks.repository.ShopRepository;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import static org.springframework.web.util.HtmlUtils.htmlEscape;

/**
 * The 8 AM daily summary email: yesterday's sales and orders plus the stock position of each
 * configured branch, one email per branch. Recipients and branches are settings, so they can
 * change without a code change. Skipped (with a log line) while mail is not configured.
 */
@Service
public class DailySummaryService {

    private static final Logger logger = LoggerFactory.getLogger(DailySummaryService.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.ENGLISH);

    private final ShopRepository shopRepository;
    private final OrderRepository orderRepository;
    private final StockService stockService;
    private final CollectionService collectionService;
    private final JavaMailSender mailSender;
    private final TransactionTemplate readOnly;
    private final String mailUsername;
    private final String mailPassword;
    private final String senderName;
    private final List<String> recipients;
    private final List<String> branchNames;

    public DailySummaryService(ShopRepository shopRepository, OrderRepository orderRepository,
                               StockService stockService, CollectionService collectionService,
                               JavaMailSender mailSender,
                               PlatformTransactionManager transactionManager,
                               @Value("${spring.mail.username:}") String mailUsername,
                               @Value("${spring.mail.password:}") String mailPassword,
                               @Value("${app.daily-summary.sender-name}") String senderName,
                               @Value("${app.daily-summary.to}") String recipients,
                               @Value("${app.daily-summary.shops}") String branchNames) {
        this.shopRepository = shopRepository;
        this.orderRepository = orderRepository;
        this.stockService = stockService;
        this.collectionService = collectionService;
        this.mailSender = mailSender;
        this.readOnly = new TransactionTemplate(transactionManager);
        this.readOnly.setReadOnly(true);
        this.mailUsername = mailUsername;
        this.mailPassword = mailPassword;
        this.senderName = senderName;
        this.recipients = splitList(recipients);
        this.branchNames = splitList(branchNames);
    }

    // Every day at 08:00 India time, covering the previous day
    @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Kolkata")
    public void sendScheduled() {
        if (!isConfigured()) {
            logger.warn("Daily summary skipped: mail is not configured (MAIL_PASSWORD) or no recipients");
            return;
        }
        try {
            List<String> sent = send(BusinessDay.today().minusDays(1));
            logger.info("Daily summary sent for {} to {}", sent, recipients);
        } catch (Exception e) {
            logger.error("Daily summary failed: {}", e.getMessage(), e);
        }
    }

    // Admin "Send now", for checking it works without waiting for 8 AM
    public String sendNow() {
        if (!isConfigured()) {
            throw new BadRequestException("Email is not set up on the server yet (MAIL_PASSWORD missing).");
        }
        LocalDate day = BusinessDay.today().minusDays(1);
        try {
            List<String> sent = send(day);
            return "Daily summary for " + day.format(DAY) + " (" + String.join(", ", sent) + ") sent to "
                    + String.join(", ", recipients);
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Daily summary failed: {}", e.getMessage(), e);
            throw new BadRequestException("Sending failed: " + e.getMessage());
        }
    }

    private boolean isConfigured() {
        return !mailPassword.isBlank() && !"changeme".equals(mailPassword)
                && !mailUsername.isBlank() && !recipients.isEmpty();
    }

    private List<String> send(LocalDate day) throws Exception {
        List<Shop> shops = shopRepository.findByActiveTrue().stream()
                .filter(this::isSelected)
                .sorted(Comparator.comparing(Shop::getName))
                .collect(Collectors.toList());
        if (shops.isEmpty()) {
            throw new BadRequestException("No active branch matches the daily summary branches: " + branchNames);
        }
        List<String> sent = new ArrayList<>();
        for (Shop shop : shops) {
            Summary summary = readOnly.execute(status -> buildSummary(shop, day));
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(new InternetAddress(mailUsername, senderName, "UTF-8"));
            helper.setTo(recipients.toArray(new String[0]));
            helper.setSubject(subject(summary));
            helper.setText(html(summary), true);
            mailSender.send(message);
            sent.add(shop.getName());
        }
        return sent;
    }

    // "ALL" sends every active branch; otherwise a branch is included when its name contains a configured name
    private boolean isSelected(Shop shop) {
        String name = shop.getName().toLowerCase(Locale.ROOT);
        return branchNames.stream().anyMatch(b -> b.equalsIgnoreCase("ALL") || name.contains(b.toLowerCase(Locale.ROOT)));
    }

    private Summary buildSummary(Shop shop, LocalDate day) {
        List<Order> orders = orderRepository.findByShopIdAndOrderDateBetween(
                shop.getId(), BusinessDay.start(day), BusinessDay.end(day));
        List<Order> delivered = orders.stream().filter(o -> o.getStatus() == OrderStatus.COMPLETED).collect(Collectors.toList());

        Summary s = new Summary();
        s.shopName = shop.getName();
        s.day = day;
        s.orders = delivered.size();
        s.sales = sum(delivered, null);
        s.cash = sum(delivered, PaymentMode.CASH);
        s.upi = sum(delivered, PaymentMode.UPI);
        // Units sold, like the day-end collection: SHOT products vs every blend
        for (Order o : delivered) {
            for (var item : o.getItems()) {
                if (item.getProduct().getCategory() == ProductCategory.SHOT) s.shots += item.getQuantity();
                else s.blends += item.getQuantity();
            }
        }
        s.cancelled = orders.stream().filter(o -> o.getStatus() == OrderStatus.CANCELLED).count();
        s.notDelivered = orders.stream().filter(o -> o.getStatus() == OrderStatus.PENDING).count();
        // Amount actually received, as entered on Daily Collection (and compared with that page's expected total)
        s.manualBranch = shop.isManualSales();
        s.collection = collectionService.getDailyCollection(day, day, shop.getId()).getBranches().stream()
                .filter(r -> shop.getId().equals(r.getShopId()))
                .findFirst()
                .orElse(null);

        Map<Long, StockResponse> current = stockService.currentStock(shop.getId()).stream()
                .collect(Collectors.toMap(StockResponse::getRawMaterialId, x -> x));
        for (StockReportResponse r : stockService.buildStockReport(shop.getId(), day, day)) {
            StockResponse now = current.get(r.getRawMaterialId());
            Row row = new Row();
            row.name = r.getRawMaterialName();
            row.quantity = now != null ? now.getQuantity() : BigDecimal.ZERO;
            row.out = row.quantity.signum() <= 0;
            row.low = !row.out && now != null && Boolean.TRUE.equals(now.getLowStock());
            row.received = r.getReceived();
            row.used = r.getUsed();
            s.stock.add(row);
        }
        // Problems first: out of stock, then low, then the rest by name
        s.stock.sort(Comparator.comparingInt((Row r) -> r.out ? 0 : r.low ? 1 : 2).thenComparing(r -> r.name));
        return s;
    }

    private BigDecimal sum(List<Order> orders, PaymentMode mode) {
        return orders.stream()
                .filter(o -> mode == null || o.getPaymentMode() == mode)
                .map(Order::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String subject(Summary s) {
        long out = s.stock.stream().filter(r -> r.out).count();
        long low = s.stock.stream().filter(r -> r.low).count();
        String alerts = out + low == 0 ? "" : " · " + (out > 0 ? out + " out of stock" : "")
                + (out > 0 && low > 0 ? ", " : "") + (low > 0 ? low + " low" : "");
        return "3Monks Daily Summary – " + s.shopName + " – " + s.day.format(DAY) + alerts;
    }

    private String html(Summary s) {
        StringBuilder h = new StringBuilder();
        h.append("<div style=\"font-family:Arial,Helvetica,sans-serif;color:#1e1b4b;max-width:640px\">")
                .append("<h2 style=\"color:#581c87;margin:0 0 4px\">").append(htmlEscape(s.shopName)).append("</h2>")
                .append("<div style=\"color:#6b7280;margin-bottom:16px\">Daily summary for ")
                .append(htmlEscape(s.day.format(DAY))).append("</div>");

        h.append("<h3 style=\"margin:16px 0 8px\">Sales</h3><table style=\"border-collapse:collapse\">");
        if (s.manualBranch) {
            // Orders are taken by hand here: the day's entered shots, blends and amount
            CollectionRow m = s.collection;
            if (m == null || m.getManualAmount() == null) {
                statRow(h, "Sales", "<span style=\"color:#6b7280;font-weight:normal\">Not entered yet</span>");
            } else {
                statRow(h, "Sales", "₹" + money(m.getTotalAmount()));
                statRow(h, "Shots sold", String.valueOf(m.getShots()));
                statRow(h, "Blends sold", String.valueOf(m.getBlends()));
            }
        } else {
            statRow(h, "Sales", "₹" + money(s.sales));
            statRow(h, "Orders", String.valueOf(s.orders));
            statRow(h, "Shots sold", String.valueOf(s.shots));
            statRow(h, "Blends sold", String.valueOf(s.blends));
            statRow(h, "Cash / UPI", "₹" + money(s.cash) + " / ₹" + money(s.upi));
        }
        CollectionRow c = s.collection;
        if (c != null && c.getActualEntries() > 0) {
            statRow(h, "Received (actual)", "₹" + money(c.getActualTotal())
                    + " <span style=\"font-weight:normal;color:#6b7280\">(Cash ₹" + money(c.getActualCash())
                    + " / UPI ₹" + money(c.getActualUpi()) + ")</span>");
            statRow(h, "Difference", difference(c.getDifference())
                    + " <span style=\"font-weight:normal;color:#6b7280\">vs ₹" + money(c.getTotalAmount())
                    + " on Daily Collection</span>");
            if (c.getActualNote() != null) statRow(h, "Note", htmlEscape(c.getActualNote()));
        } else if (c != null && c.getActualSlots() > 0) {
            statRow(h, "Received (actual)", "<span style=\"color:#6b7280;font-weight:normal\">Not entered yet</span>");
        }
        if (s.cancelled > 0) statRow(h, "Cancelled orders", String.valueOf(s.cancelled));
        if (s.notDelivered > 0) statRow(h, "Not delivered", String.valueOf(s.notDelivered));
        h.append("</table>");

        h.append("<h3 style=\"margin:20px 0 8px\">Stock</h3>")
                .append("<table style=\"border-collapse:collapse;width:100%;font-size:14px\"><tr style=\"background:#ede9fe\">");
        for (String col : new String[] {"Material", "Now", "Received yesterday", "Used yesterday", "Status"}) {
            h.append("<th style=\"text-align:left;padding:6px 8px\">").append(col).append("</th>");
        }
        h.append("</tr>");
        for (Row r : s.stock) {
            // Out of stock and low rows are highlighted (and listed first)
            String status = r.out ? "<b style=\"color:#991b1b\">Out of stock</b>"
                    : r.low ? "<b style=\"color:#92400e\">Low</b>" : "<span style=\"color:#065f46\">OK</span>";
            String background = r.out ? "background:#fee2e2;" : r.low ? "background:#fef3c7;" : "";
            h.append("<tr style=\"").append(background).append("border-top:1px solid #e5e7eb\">")
                    .append(cell(htmlEscape(r.name)))
                    .append(cell("<b>" + number(r.quantity) + "</b>"))
                    .append(cell(r.received.signum() != 0 ? "+" + number(r.received) : "-"))
                    .append(cell(r.used.signum() != 0 ? "−" + number(r.used) : "-"))
                    .append(cell(status)).append("</tr>");
        }
        h.append("</table><p style=\"color:#9ca3af;font-size:12px;margin-top:20px\">Sent automatically by 3Monks every day at 8 AM. ")
                .append("Sales count delivered orders only.</p></div>");
        return h.toString();
    }

    private static void statRow(StringBuilder h, String label, String value) {
        h.append("<tr><td style=\"padding:3px 16px 3px 0;color:#6b7280\">").append(label)
                .append("</td><td style=\"padding:3px 0;font-weight:bold\">").append(value).append("</td></tr>");
    }

    private static String cell(String content) {
        return "<td style=\"padding:6px 8px\">" + content + "</td>";
    }

    private static String number(BigDecimal q) {
        return q.setScale(3, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    private static String money(BigDecimal amount) {
        return String.format(Locale.ENGLISH, "%,.0f", amount);
    }

    // Actual − expected: red when short, green when over, a tick when it matches
    private static String difference(BigDecimal diff) {
        if (diff.signum() == 0) return "<span style=\"color:#065f46\">₹0 ✓</span>";
        String text = (diff.signum() < 0 ? "−₹" : "+₹") + money(diff.abs());
        return "<span style=\"color:" + (diff.signum() < 0 ? "#991b1b" : "#065f46") + "\">" + text + "</span>";
    }

    private static List<String> splitList(String value) {
        return Arrays.stream(value == null ? new String[0] : value.split(","))
                .map(String::trim).filter(v -> !v.isEmpty()).collect(Collectors.toList());
    }

    private static class Summary {
        boolean manualBranch;
        String shopName;
        LocalDate day;
        long orders;
        BigDecimal sales;
        BigDecimal cash;
        BigDecimal upi;
        int shots;
        int blends;
        long cancelled;
        long notDelivered;
        CollectionRow collection;
        List<Row> stock = new ArrayList<>();
    }

    private static class Row {
        String name;
        BigDecimal quantity;
        boolean out;
        boolean low;
        BigDecimal received;
        BigDecimal used;
    }
}
