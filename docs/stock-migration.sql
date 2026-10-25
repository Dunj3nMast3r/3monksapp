-- ==========================================================
-- 3Monks — Standalone stock management migration
-- ==========================================================
-- Stock is no longer derived from orders and recipes. It is
-- maintained by hand through purchase / consumption /
-- adjustment entries, so the old order-driven tables and
-- balances are cleared out here.
--
-- RUN THIS *AFTER* DEPLOYING THE NEW BUILD. Hibernate creates
-- the stock_transactions table on startup (ddl-auto: update);
-- running this first will fail on the DELETE below.
--
-- ddl-auto never drops anything, so the obsolete tables and
-- column have to be removed manually — that is the rest of
-- this script.
--
-- TAKE A BACKUP FIRST:
--   sudo docker compose -f docker-compose.prod.yml exec -T postgres \
--     pg_dump -U postgres threemonks | gzip > ~/threemonks-$(date +%F).sql.gz
--
-- Then run:
--   sudo docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U postgres -d threemonks -f - < docs/stock-migration.sql
-- ==========================================================

BEGIN;

-- 1. Clear existing stock balances and the new ledger, so the
--    opening position is entered fresh through the UI.
DELETE FROM stock_transactions;
DELETE FROM stocks;

-- 2. Drop the order-driven history table (replaced by stock_transactions).
DROP TABLE IF EXISTS stock_history;

-- 3. Drop recipes — products no longer map to raw materials.
DROP TABLE IF EXISTS recipes;

-- 4. opening_stock held "first ever quantity entered", which was
--    misleading and is no longer written.
ALTER TABLE stocks DROP COLUMN IF EXISTS opening_stock;

-- 5. Purchases are financial records (vendor, invoice, GST) and are
--    KEPT by default. They no longer affect stock. Uncomment only if
--    you want to clear that history too.
-- DELETE FROM purchases;

COMMIT;

-- Verify:
--   SELECT COUNT(*) FROM stocks;              -- expect 0
--   SELECT COUNT(*) FROM stock_transactions;  -- expect 0
--   \d stocks                                 -- no opening_stock column
