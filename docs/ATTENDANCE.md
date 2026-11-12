# Staff attendance

**Attendance** in the menu (admins: any branch; managers: their own branch).

## Daily register

Pick a day (◀ ▶ or the date box; it uses the business day, 3 AM cut-off) and tap
a status for each employee:

| Status | |
|---|---|
| ✅ Present | Worked the full day |
| 🌗 Half day | Worked half the day |
| 🏖️ Leave | Any day off (there is no separate weekly off) |
| ❌ Absent | Didn't come, without leave |

- Tap the selected status again to clear it (back to **Not marked**).
- **Mark all unmarked present** fills everyone not yet marked; change the
  exceptions, then **Save**. Changes are saved together; **Undo** discards them.
- An optional note per person (e.g. "came at 6 PM").
- Future dates: only **Leave** can be marked (planned days off).
- Each mark records who marked it and when; one mark per employee per day.

## Monthly summary

Per employee: Present, Half day, Leave, Absent and **Not marked** (days
from the 1st, or the day they joined, up to today with no mark). The day-by-day
grid shows each mark; dashed cells are days still to be marked. Tap a day to open
it in the register.

Records only: attendance does not change pay. Moving an employee to another branch
keeps their past marks with the branch they were at.

## Paid leave balance

- **Shops → Edit → Paid leaves per month**: how many paid leaves each employee at
  that branch gets a month (e.g. 2; halves allowed). Empty = balance not tracked.
- **Shops → Edit → Leave starts from (month)** (optional): no leave is given or
  counted before this month at that branch (e.g. Kharadi: November 2026). Empty =
  from each employee's joining month.
- **Employees → Add / Edit → Joining date**: leave is given from this month.
  Employees added before this existed got the day they were added to the app;
  correct it if they joined earlier.
- Each month the branch's leaves are added (each branch can have its own number);
  **Leave** uses 1, **Half day** 0.5. Every day off is Leave: there is no separate
  weekly off. Unused leave carries into the next month, **at most 6**;
  no yearly reset.
- Leave beyond the balance is shown as **extra leave** for that month (allowed, not
  blocked); it doesn't reduce later months.

Where it shows: each person's "paid leave left" on the daily register (with a
warning when marking leave they don't have), a **Paid leave** table in the monthly
summary (carried, +month, used, left, extra), and **Leave left** on the Employees
list.

## Staff sales incentive

Turn it on per branch in **Shops → Edit → Staff sales incentive**: free units per
day (e.g. 50), ₹ per unit above (e.g. ₹1) and the start date (e.g. 1 Nov 2026).

- Each day: per person = (shots + blends sold that day − free units) × ₹ per unit,
  or ₹0 when sales are at or below the free units. Units come from Manual Sales
  Entry and/or app orders (cancelled left out).
- Every **staff (operator)** marked **Present** that day gets the full amount; **Half
  day** gets half; Leave, Absent or not marked get nothing. Managers are not included.
  Example: 100 units → ₹50 to each staff member present.
- An **admin** can change one day's per-person amount on Manual Sales Entry (empty =
  the rule). A manager saving that day keeps the admin's amount.
- Turning it off hides it everywhere and keeps the rule for next time.

Where it shows: "🎁 ₹X/person" under each day on Manual Sales Entry, a **Sales
incentive** table in the Attendance monthly summary, and a **Sales incentive**
column in the salary sheet (added to Total Pay).
