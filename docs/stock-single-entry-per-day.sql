-- ==========================================================
-- 3Monks — one stock entry per material per day
-- ==========================================================
-- Entering the same material twice for the same date used to
-- add a second row. It now folds into the existing row, so a
-- day always reads as a single figure.
--
-- Rows already recorded under the old behaviour have to be
-- collapsed, and a unique index added so nothing can create a
-- duplicate again.
--
-- RUN THIS *AFTER* DEPLOYING THE NEW BUILD — Hibernate adds the
-- updated_at / updated_by columns on startup.
--
-- TAKE A BACKUP FIRST:
--   sudo docker compose -f docker-compose.prod.yml exec -T postgres \
--     pg_dump -U postgres threemonks | gzip > ~/threemonks-$(date +%F).sql.gz
--
-- Then run:
--   sudo docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U postgres -d threemonks -f - < docs/stock-single-entry-per-day.sql
--
-- This only reshapes the ledger rows. Stock balances in `stocks`
-- are already correct and are not touched.
-- ==========================================================

BEGIN;

-- How many duplicates are about to be merged (0 means nothing to do).
SELECT COUNT(*) AS duplicate_groups
FROM (
    SELECT 1
    FROM stock_transactions
    GROUP BY shop_id, raw_material_id, txn_date, txn_type
    HAVING COUNT(*) > 1
) d;

-- 1. Fold each group's quantities into its most recent row. The newest row is
--    kept so that an adjustment keeps the latest physical count, which is the
--    one that actually applied.
WITH merged AS (
    SELECT shop_id, raw_material_id, txn_date, txn_type,
           SUM(quantity_change) AS total_change,
           MAX(id)              AS keep_id,
           MIN(created_at)      AS first_created
    FROM stock_transactions
    GROUP BY shop_id, raw_material_id, txn_date, txn_type
    HAVING COUNT(*) > 1
)
UPDATE stock_transactions t
SET quantity_change = m.total_change,
    created_at      = m.first_created,
    updated_at      = NOW()
FROM merged m
WHERE t.id = m.keep_id;

-- 2. Drop the now-redundant rows.
DELETE FROM stock_transactions t
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY shop_id, raw_material_id, txn_date, txn_type
               ORDER BY id DESC
           ) AS rn
    FROM stock_transactions
) d
WHERE t.id = d.id AND d.rn > 1;

-- 3. Backfill updated_at on rows that predate the column.
UPDATE stock_transactions SET updated_at = created_at WHERE updated_at IS NULL;

-- 4. Guard at the database level. The service upserts, but this makes a
--    duplicate impossible regardless of how a row is written.
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_txn_material_day_type
    ON stock_transactions (shop_id, raw_material_id, txn_date, txn_type);

COMMIT;

-- Verify — both should return 0 rows:
--   SELECT shop_id, raw_material_id, txn_date, txn_type, COUNT(*)
--   FROM stock_transactions
--   GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
--
--   SELECT COUNT(*) FROM stock_transactions WHERE updated_at IS NULL;
