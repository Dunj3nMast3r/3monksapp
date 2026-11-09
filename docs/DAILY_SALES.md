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
| Cash received, UPI received | Optional. Both empty = not known yet (no difference is worked out, and the day never shows as a shortfall); one empty with the other filled = ₹0 |
| Difference | Worked out: received − sales |
| Note | Optional |

One entry per branch per day; saving the same date again updates it. Tap a day
in the list to edit or remove it.

## Loading past days

There is no upload in the app. Past days (Hinjewadi from 8 Feb 2026) are loaded
once by a script from the sheet you provide, using the same rules as the form.

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
