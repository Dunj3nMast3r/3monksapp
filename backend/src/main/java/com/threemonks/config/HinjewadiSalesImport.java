package com.threemonks.config;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * ONE-TIME data load: Hinjewadi's daily sales, 8 Feb – 18 Oct 2026, from the
 * Sales_Report sheet (shots, blends, the day's prices — offers on 8–14 Feb — and
 * notes; amount received left empty).
 *
 * <p>Runs at startup until it has succeeded once, then never again (recorded in
 * {@code data_imports}). It needs exactly one branch named like "Hinjewadi"; until
 * then it only logs and tries again on the next start. It makes that branch a
 * manual-sales branch (shot ₹40, blend ₹90) if it isn't already, never overwrites
 * a day already entered in the app, and checks the file's totals against the
 * sheet before saving anything. All in one transaction.
 *
 * <p>Remove this class and the data file once the data has been checked; the
 * {@code data_imports} row keeps it from ever running again regardless.
 */
@Component
@RequiredArgsConstructor
@Order(10) // after DatabaseMigration and DataInitializer
public class HinjewadiSalesImport implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(HinjewadiSalesImport.class);
    private static final String NAME = "hinjewadi-sales-2026-02-08-to-2026-10-18";
    private static final String FILE = "data/hinjewadi_sales_2026-02-08_to_2026-10-18.tsv";

    // The sheet's own totals (Sales_Report → TOTAL SALES); the file must match them exactly
    private static final int EXPECTED_DAYS = 251;
    private static final long EXPECTED_SHOTS = 23375;
    private static final long EXPECTED_BLENDS = 10158;
    private static final BigDecimal EXPECTED_SALES = new BigDecimal("1834618.00");

    private final JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;

    @Override
    public void run(String... args) {
        try {
            importOnce();
        } catch (Exception e) {
            // Never stop the app from starting; the load is retried on the next start
            logger.error("Hinjewadi sales import failed, nothing saved; will retry on next start: {}", e.getMessage(), e);
        }
    }

    private void importOnce() throws Exception {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS data_imports ("
                + "name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL, details VARCHAR(500))");
        Integer done = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM data_imports WHERE name = ?", Integer.class, NAME);
        if (done != null && done > 0) return;

        List<Row> rows = readFile();
        long shots = rows.stream().mapToLong(r -> r.shots).sum();
        long blends = rows.stream().mapToLong(r -> r.blends).sum();
        BigDecimal sales = rows.stream().map(Row::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (rows.size() != EXPECTED_DAYS || shots != EXPECTED_SHOTS || blends != EXPECTED_BLENDS
                || sales.compareTo(EXPECTED_SALES) != 0) {
            logger.error("Hinjewadi sales import: file totals ({} days, {} shots, {} blends, {}) do not match the sheet; not loaded",
                    rows.size(), shots, blends, sales);
            return;
        }

        List<Long> shopIds = jdbcTemplate.queryForList("SELECT id FROM shops WHERE name ILIKE '%hinjewadi%'", Long.class);
        if (shopIds.size() != 1) {
            logger.warn("Hinjewadi sales import waiting: expected exactly one branch named like Hinjewadi, found {}; "
                    + "will try again on the next start", shopIds.size());
            return;
        }
        long shopId = shopIds.get(0);

        int[] result = new TransactionTemplate(transactionManager).execute(status -> {
            // A manual-sales branch with its prices (kept if already set)
            jdbcTemplate.update("UPDATE shops SET manual_sales = TRUE, shot_price = COALESCE(shot_price, 40), "
                    + "blend_price = COALESCE(blend_price, 90) WHERE id = ?", shopId);
            LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Kolkata"));
            int inserted = 0;
            for (Row r : rows) {
                // Days already entered in the app are left exactly as they are
                inserted += jdbcTemplate.update("INSERT INTO manual_daily_sales "
                                + "(shop_id, sales_date, shots, blends, shot_price, blend_price, amount, note, updated_by, updated_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sheet-import', ?) ON CONFLICT (shop_id, sales_date) DO NOTHING",
                        shopId, Date.valueOf(r.date), r.shots, r.blends, r.shotPrice, r.blendPrice, r.amount(), r.note, now);
            }
            String details = inserted + " of " + rows.size() + " days loaded (" + (rows.size() - inserted)
                    + " already entered, kept); branch id " + shopId;
            jdbcTemplate.update("INSERT INTO data_imports (name, applied_at, details) VALUES (?, ?, ?)", NAME, now, details);
            return new int[] {inserted, rows.size() - inserted};
        });
        logger.info("Hinjewadi sales import done: {} days loaded, {} already entered and kept (shots {}, blends {}, sales {} in the file)",
                result[0], result[1], shots, blends, sales);
    }

    private List<Row> readFile() throws Exception {
        List<Row> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(FILE).getInputStream(), StandardCharsets.UTF_8))) {
            String line = reader.readLine(); // header
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                String[] c = line.split("\t", -1);
                rows.add(new Row(LocalDate.parse(c[0]), Integer.parseInt(c[1]), Integer.parseInt(c[2]),
                        new BigDecimal(c[3]), new BigDecimal(c[4]), c.length > 5 && !c[5].isBlank() ? c[5].trim() : null));
            }
        }
        return rows;
    }

    private record Row(LocalDate date, int shots, int blends, BigDecimal shotPrice, BigDecimal blendPrice, String note) {
        BigDecimal amount() {
            return shotPrice.multiply(BigDecimal.valueOf(shots)).add(blendPrice.multiply(BigDecimal.valueOf(blends)));
        }
    }
}
