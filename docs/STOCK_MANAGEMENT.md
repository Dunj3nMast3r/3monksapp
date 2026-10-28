# Stock Management

Stock is maintained **manually**. Nothing in the ordering flow touches it.

## How it works

Every stock movement is a row in `stock_transactions`, and the running balance
per shop × raw material lives in `stocks`.

| Entry | Effect | Recorded as |
|-------|--------|-------------|
| **Add purchased stock** | increases the balance | `PURCHASE` |
| **Deduct consumed stock** | decreases the balance | `CONSUMPTION` |
| **Adjust** | sets the balance to a physical count | `ADJUSTMENT` |

Each entry carries a **business date** (`txn_date`) that the user picks — it
defaults to today and can be backdated. That is kept separate from `created_at`,
which is when the row was actually entered.

An adjustment takes the **actual count** from a physical stock check. The service
works out the difference against the current balance and stores both: the signed
delta in `quantity_change` and the entered figure in `actual_count`.

Multiple entries on the same day are all kept. The UI rolls them up into one row
per material per day.

## Entering stock

The Stock Entry screen lists **every active raw material as a row** — material,
current balance, a quantity box and a date — with one **Save** button for the
whole table. Rows left blank are skipped, so you only fill in what moved. A date
control above the table fills every row at once, and individual rows can still be
changed if a day's figures are being backfilled separately.

The three modes (Add Stock / Deduct Consumption / Adjust) share the table; only
the quantity column changes meaning, so switching mode clears what was typed.

A save goes through `POST /api/manager/stock/bulk` as a **single transaction**.
If any line is rejected — almost always because a consumption would take a
balance below zero — nothing is written and the error names the material. That
way you never end up with half a day's figures recorded.

## Rules

- **Stock can never go negative.** A consumption or downward adjustment that
  would take the balance below zero is rejected with the available quantity in
  the message.
- The balance row is locked for the duration of the transaction
  (`StockRepository.findForUpdate`), so two people entering at once cannot both
  pass the check.
- The negative check applies to the **current** balance, not the balance as it
  stood on a backdated date. Historical positions are not reconstructed.

## What does *not* move stock

Deliberately, and marked with comments in the code so it stays that way:

- **Placing an order** (`OrderService.createOrder`)
- **Cancelling an order** (`OrderService.cancelOrder`)
- **Recording or deleting a purchase** (`StockService.createPurchase`,
  `deletePurchase`) — the purchase ledger keeps vendor, invoice, GST and cost,
  but has no stock side effect.

Recipes have been removed entirely; products no longer map to raw materials.

## API

All endpoints require `SUPER_ADMIN` or `SHOP_MANAGER`. Non-admins are restricted
to their own shop.

| Method | Path |
|--------|------|
| `GET`  | `/api/manager/shop/{shopId}/stock` |
| `GET`  | `/api/manager/shop/{shopId}/stock/low` |
| `GET`  | `/api/manager/shop/{shopId}/stock/summary?from=&to=` |
| `POST` | `/api/manager/stock/purchase` |
| `POST` | `/api/manager/stock/consumption` |
| `POST` | `/api/manager/stock/adjustment` |
| `POST` | `/api/manager/stock/bulk` |

`from`/`to` are ISO dates and default to the last 30 days.

## Daily stock email (not built yet)

`StockReportService.buildReportForAllShops()` already produces the current stock
position for every active shop. Sending the planned 8 AM IST email is then:

1. `@EnableScheduling` on the application class.
2. A `@Scheduled(cron = "0 0 8 * * *", zone = "Asia/Kolkata")` method that calls
   `buildReportForAllShops()` and passes the result to `EmailService`.

**Before it can send**, the deploy pipeline has to supply mail credentials.
`.github/workflows/deploy.yml` rewrites `/opt/threemonks/.env` on every deploy
with only five variables, so `MAIL_PASSWORD` falls back to `changeme` and Gmail
rejects it. A Gmail app password needs to be added as a GitHub secret and
written into `.env` alongside the others.
