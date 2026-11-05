# Stock Management

Stock is maintained **manually**. Nothing in the ordering flow touches it.

## How it works

Every stock movement is a row in `stock_transactions`, and the running balance
per shop × raw material lives in `stocks`.

| Entry | Effect | Recorded as |
|-------|--------|-------------|
| **📤 Used** (consumed today) | decreases the balance | `CONSUMPTION` |
| **📥 Received** (purchased stock) | increases the balance | `PURCHASE` |
| **🔄 Correct Count** | sets the balance to a physical count | `ADJUSTMENT` |

## Units

Raw materials have a category. **Fruits are always in KG**: the service stores KG
whatever unit is sent, and the form locks it. Other materials (milk, pulp,
packaging) keep their own unit. A material's unit cannot change once stock has
been recorded for it, because the existing balances and history are in that unit.

Quantities are stored with 3 decimals, so KG keeps gram precision (0.250 kg).
At startup `DatabaseMigration` gives older raw materials a category (weight-based
or named like a fruit → FRUIT, else OTHER) and converts any fruit still in GRAM to
KG: balances, history, purchases and reorder level divided by 1000, price per unit
multiplied by 1000, in one transaction. It only touches rows not yet converted.

## Low stock

A balance is **low** when it is at or below the shop's own minimum, if one was set,
otherwise the material's **Reorder Level** (Raw Materials page). In practice that
is the reorder level, since no screen sets a per-shop minimum.

Each entry carries a **business date** (`txn_date`) that the user picks — it
defaults to today and can be backdated. That is kept separate from `created_at`,
which is when the row was actually entered.

An adjustment takes the **actual count** from a physical stock check. The service
works out the difference against the current balance and stores both: the signed
delta in `quantity_change` and the entered figure in `actual_count`.

There is **at most one row per material per day per type**. Entering the same
material again for the same date folds into that row rather than adding another:
quantities accumulate, and an adjustment's `actual_count` is replaced because the
latest physical count is the one that applies. So a day always reads as a single
figure, however many times it was entered.

## Entering stock

Stock Management opens on **Current Stock** (balance, unit and Out of stock / Low /
OK status, problems first). **Update Stock** lists **every active raw material as a
row** — material, current balance and a quantity box with its unit — with one
**Save** for the whole table. Rows left blank are skipped, so you only fill in what
moved. Each filled row shows the balance it will leave ("→ 7 kg"), a row that would
go below zero is flagged before saving, and saving first shows a review of every
change (before → after).

**One date applies to the whole table**, set above it and defaulting to today.
Backdating is done by changing that one control, not per row.

The three modes (Used / Received / Correct Count) share the table; only the
quantity column changes meaning. Each mode keeps its own typed values, so switching
loses nothing; only the mode being saved is cleared.

A save goes through `POST /api/manager/stock/bulk` as a **single transaction**.
If any line is rejected — almost always because a consumption would take a
balance below zero — nothing is written and the error names the material. That
way you never end up with half a day's figures recorded.

## Report and corrections

The **Report** tab shows, per material and for a date range (Today, Yesterday,
Last 7 days, This month or custom), **Opening + Received − Used ± count
corrections = Closing**. It is anchored on today's balance: closing = balance now
minus every change dated after the range, so it stays right for stock recorded
before the ledger existed. It lists every material; the search box narrows it down.

**Update Stock** lists the entries recorded on the chosen date. A wrong one can
be **removed**, which reverses its effect on the balance
(`DELETE /api/manager/stock/entries/{id}`). Removal is limited to the last 7 days
(older mistakes are fixed with Correct Count) and refused when it would take the
balance below zero, for example a delivery whose stock was already used.

## Rules

- **Stock can never go negative.** A consumption or downward adjustment that
  would take the balance below zero is rejected with the available quantity in
  the message.
- The balance row is locked for the duration of the transaction
  (`StockRepository.findForUpdate`), so two people entering at once cannot both
  pass the check.
- The negative check applies to the **current** balance, not the balance as it
  stood on a backdated date. Historical positions are not reconstructed.
- A unique index on `(shop_id, raw_material_id, txn_date, txn_type)` makes a
  duplicate day row impossible at the database level, not just in the service.

## What does *not* move stock

Deliberately, and marked with comments in the code so it stays that way:

- **Placing an order** (`OrderService.createOrder`)
- **Cancelling an order** (`OrderService.cancelOrder`)
- **Recording or deleting a purchase** (`StockService.createPurchase`,
  `deletePurchase`) — the purchase ledger keeps vendor, invoice, GST and cost,
  but has no stock side effect.
  The Purchases screen is hidden from the app for now (its old link opens Stock);
  the purchase API and the recorded data are kept.

Recipes have been removed entirely; products no longer map to raw materials.

## API

All endpoints require `SUPER_ADMIN` or `SHOP_MANAGER`. Non-admins are restricted
to their own shop.

| Method | Path |
|--------|------|
| `GET`  | `/api/manager/shop/{shopId}/stock` |
| `GET`  | `/api/manager/shop/{shopId}/stock/low` |
| `GET`  | `/api/manager/shop/{shopId}/stock/summary?from=&to=` |
| `GET`  | `/api/manager/shop/{shopId}/stock/report?from=&to=` |
| `GET`  | `/api/manager/shop/{shopId}/stock/entries?date=` |
| `DELETE` | `/api/manager/stock/entries/{id}` |
| `POST` | `/api/manager/stock/purchase` |
| `POST` | `/api/manager/stock/consumption` |
| `POST` | `/api/manager/stock/adjustment` |
| `POST` | `/api/manager/stock/bulk` |

`from`/`to` are ISO dates and default to the last 30 days.

## Daily summary email

`DailySummaryService` emails a summary every day at **8 AM IST** covering the
previous day, one email per branch:

- Sales (₹, delivered orders only), order count, drinks sold, Cash / UPI split,
  cancelled and not-delivered orders.
- Current stock of every material with yesterday's received and used.
  Out-of-stock rows are highlighted red and low rows amber, and listed first
  (Low = below the reorder level, or the shop's own minimum if one is set).

Sender: **3Monks Daily Summary** `<3monks.official@gmail.com>` over Gmail SMTP
(smtp.gmail.com:587, STARTTLS). Admins can send it straight away from
**Stock → Report → Send daily summary now** (`POST /api/admin/daily-summary/send`).

Settings (environment variables, comma-separated):

| Variable | Default | Meaning |
|---|---|---|
| `MAIL_PASSWORD` | – | Gmail App Password for 3monks.official@gmail.com (GitHub secret) |
| `DAILY_SUMMARY_TO` | `3monks.official@gmail.com` | Recipients (GitHub variable) |
| `DAILY_SUMMARY_SHOPS` | `Kharadi` | Branches; a branch matches when its name contains one of these. `ALL` = every active branch (GitHub variable) |

Without `MAIL_PASSWORD` the 8 AM run is skipped with a log line, and the
"Send now" button says email is not set up.

