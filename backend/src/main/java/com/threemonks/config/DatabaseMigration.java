package com.threemonks.config;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

@Component
@RequiredArgsConstructor
@Order(1) // Run before DataInitializer
public class DatabaseMigration implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseMigration.class);

    private final JdbcTemplate jdbcTemplate;
    private final PlatformTransactionManager transactionManager;

    @Override
    public void run(String... args) {
        migrateProductImageColumn();
        widenStockQuantities();
        classifyRawMaterials();
        backfillJoinDates();
        weekOffToLeave();
    }

    // No separate weekly off any more: days marked Week off become Leave (and use the monthly allowance)
    private void weekOffToLeave() {
        List<Integer> table = jdbcTemplate.queryForList(
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance'", Integer.class);
        if (table.isEmpty()) return;
        int n = jdbcTemplate.update("UPDATE attendance SET status = 'LEAVE' WHERE status = 'WEEK_OFF'");
        if (n > 0) logger.info("Changed {} Week off attendance marks to Leave", n);
    }

    // Employees from before the joining date existed: use the day they were added to the app
    private void backfillJoinDates() {
        int n = jdbcTemplate.update("UPDATE employees SET join_date = CAST(created_at AS date) "
                + "WHERE join_date IS NULL AND created_at IS NOT NULL");
        if (n > 0) logger.info("Set joining date for {} existing employees from the day they were added", n);
    }

    // Quantities to 3 decimals, so stock in KG keeps gram precision (0.250 kg)
    private void widenStockQuantities() {
        String[][] columns = {
                {"stocks", "quantity"}, {"stocks", "minimum_threshold"},
                {"stock_transactions", "quantity_change"}, {"stock_transactions", "actual_count"},
                {"purchases", "quantity"}, {"raw_materials", "reorder_level"}};
        for (String[] c : columns) {
            List<Integer> scale = jdbcTemplate.queryForList(
                    "SELECT numeric_scale FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
                    Integer.class, c[0], c[1]);
            if (!scale.isEmpty() && scale.get(0) != null && scale.get(0) < 3) {
                jdbcTemplate.execute("ALTER TABLE " + c[0] + " ALTER COLUMN " + c[1] + " TYPE NUMERIC(12,3)");
                logger.info("Widened {}.{} to NUMERIC(12,3)", c[0], c[1]);
            }
        }
    }

    /**
     * Gives raw materials from before categories a category: weight-based ones and those named like
     * a fruit become FRUIT, the rest OTHER. Fruits are kept in KG, so any recorded in GRAM are
     * converted, balances, history, purchases, reorder level and price included, in one transaction.
     * Idempotent: only rows without a category, and fruits still in GRAM, are touched.
     */
    private void classifyRawMaterials() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            int fruits = jdbcTemplate.update("UPDATE raw_materials SET category = 'FRUIT' WHERE category IS NULL"
                    + " AND (unit_type IN ('KG', 'GRAM') OR LOWER(name) IN (SELECT LOWER(name) FROM fruits))");
            int others = jdbcTemplate.update("UPDATE raw_materials SET category = 'OTHER' WHERE category IS NULL");
            if (fruits + others > 0) {
                logger.info("Classified raw materials: {} fruit, {} other", fruits, others);
            }

            String inGram = "(SELECT id FROM raw_materials WHERE category = 'FRUIT' AND unit_type = 'GRAM')";
            jdbcTemplate.update("UPDATE stocks SET quantity = quantity / 1000, minimum_threshold = minimum_threshold / 1000"
                    + " WHERE raw_material_id IN " + inGram);
            jdbcTemplate.update("UPDATE stock_transactions SET quantity_change = quantity_change / 1000,"
                    + " actual_count = actual_count / 1000 WHERE raw_material_id IN " + inGram);
            jdbcTemplate.update("UPDATE purchases SET quantity = quantity / 1000 WHERE raw_material_id IN " + inGram);
            int converted = jdbcTemplate.update("UPDATE raw_materials SET unit_type = 'KG', reorder_level = reorder_level / 1000,"
                    + " cost_per_unit = cost_per_unit * 1000 WHERE category = 'FRUIT' AND unit_type = 'GRAM'");
            if (converted > 0) {
                logger.info("Converted {} fruit raw materials from GRAM to KG", converted);
            }

            // Fruits in a unit that cannot be converted (e.g. PIECE) are switched to KG as-is
            List<String> other = jdbcTemplate.queryForList(
                    "SELECT name || ' (' || unit_type || ')' FROM raw_materials WHERE category = 'FRUIT' AND unit_type <> 'KG'",
                    String.class);
            if (!other.isEmpty()) {
                jdbcTemplate.update("UPDATE raw_materials SET unit_type = 'KG' WHERE category = 'FRUIT' AND unit_type <> 'KG'");
                logger.warn("Fruit raw materials switched to KG without conversion, check their stock: {}", other);
            }
        });
    }

    /**
     * Migrate the products.image column from OID to BYTEA if needed.
     * This fixes the issue where @Lob previously created the column as OID type,
     * but the entity now expects BYTEA.
     */
    private void migrateProductImageColumn() {
        try {
            // Check if the products table exists
            String checkTable = "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products')";
            Boolean tableExists = jdbcTemplate.queryForObject(checkTable, Boolean.class);

            if (Boolean.FALSE.equals(tableExists)) {
                logger.info("Products table does not exist yet, skipping image column migration");
                return;
            }

            // Check the current data type of the image column
            String checkColumnType = """
                    SELECT data_type FROM information_schema.columns
                    WHERE table_name = 'products' AND column_name = 'image'
                    """;

            String dataType;
            try {
                dataType = jdbcTemplate.queryForObject(checkColumnType, String.class);
            } catch (Exception e) {
                logger.info("Image column does not exist yet, skipping migration");
                return;
            }

            if ("oid".equalsIgnoreCase(dataType)) {
                logger.info("Migrating products.image column from OID to BYTEA...");
                jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN image TYPE BYTEA USING lo_get(image)");
                logger.info("Successfully migrated products.image column to BYTEA");
            } else {
                logger.info("Products.image column is already type: {}, no migration needed", dataType);
            }
        } catch (Exception e) {
            logger.warn("Image column migration failed (may be safe to ignore if column is already correct): {}",
                    e.getMessage());
        }
    }
}
