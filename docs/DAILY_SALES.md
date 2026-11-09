# Daily Sales (branches that take orders by hand)

For a branch that does not take orders in the app (e.g. **Hinjewadi**), each
day's sales are entered by hand and then appear in every sales report, branch
by branch, like the other branches.

## Setting up a branch

**Shops → Edit** the branch → tick **Sales entered manually** and set the
**shot price** and **blend price** (Hinjewadi: shot ₹40, blend ₹90).

New prices apply to days entered from then on; days already entered keep the
prices they were entered with.

## Entering a day — Daily Sales page

Admins (any manual branch) and the branch's manager (own branch only) see
**Daily Sales** in the menu.

| Field | |
|---|---|
| Date | Any past date |
| Shots sold, Blends sold | Entered |
| Sales | Worked out: shots × shot price + blends × blend price |
| Cash received, UPI received | Entered |
| Difference | Worked out: received − sales |
| Note | Optional |

One entry per branch per day; saving the same date again updates it. Tap a day
in the list to edit or remove it.

## Importing past days from Google Sheets

Sheet columns (header row first): **Date, Shots, Blends, Cash received, UPI
received**, optional **Note**. Dates like `08-02-2026` or `08/02/2026` (day
first); empty cash / UPI means 0; `₹` and commas in amounts are fine.

Google Sheets → **File → Download → Comma-separated values (.csv)** → Daily
Sales → **Import sheet** → choose the file → **Import**.

Every row is checked first. If any row is wrong (impossible or future date,
date twice, text in a number column…) **nothing is saved** and the rows to fix
are listed. Dates already entered are updated, not duplicated.

## Where the days show up

| Report | |
|---|---|
| Daily Collection | The branch's own row: sales, shots, blends, received, difference ("✍️ entered by hand") |
| Dashboard | Today / yesterday / month figures, daily and monthly trends, branches leaderboard |
| Admin & branch dashboards, Reports (profit & loss) | Sales per branch and in the all-branches total |
| Analytics | Daily sales, monthly profit & loss, break-even revenue |
| 8 AM email | Sales, shots, blends, received and difference for the branch (when the branch is in `DAILY_SUMMARY_SHOPS`) |

Not available from daily totals: top products, peak hours, order counts and
average order value (the average uses app orders only), the orders export.

If app orders are also placed at a manual branch, both are counted.
