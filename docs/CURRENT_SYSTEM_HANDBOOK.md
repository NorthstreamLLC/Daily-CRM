# Daily Gamba CRM — How It Works

Reference for the whole system: the files, the people, the funnel, the numbers, and the maintenance tools. Written from the actual build scripts, not from memory.

---

## 1. What the system is

**13 separate Google Sheets files.**

- **12 rep files** — one per person. Each holds that rep's own players and their daily work.
- **1 Master Dashboard** — a company-wide read-only view. It holds no data of its own; it copies from the 12 rep files and adds everything up.

A rep only ever works in their own file. The Master is for you.

**The chain:**

```
Rep's Book  →  hidden mirror tab in the Master  →  the dashboards you look at
```

The middle step used to use IMPORTRANGE, which silently truncated. It now uses a script that copies every row. Run **FIX EVERYTHING** on the Master to refresh, or leave hourly auto-sync on.

---

## 2. The team

| Rep | Code | Role | Platforms |
|---|---|---|---|
| Tuna | TU | Acquisition | Instagram |
| Plat | PL | Acquisition, Stream Help | Discord, Telegram, Twitter |
| Chella | CH | Acquisition | Discord, Telegram, Twitter |
| Moneyheist | MH | Acquisition | Discord |
| Seb | SB | Acquisition | SlotEssentials |
| Jordan | JD | Acquisition | Discord, SlotEssentials |
| Seanok | SK | Acquisition | SlotEssentials |
| Prime | IC | Manager | All |
| Daily | DL | Manager | All |
| Gwen | GW | VIP Team | Discord, Telegram, SlotEssentials |
| Miko | MK | VIP Team | Discord, Telegram, SlotEssentials |
| Concept | CN | VIP Team | Discord, Telegram, SlotEssentials |

Player IDs come from the rep's code and the row number — `MH-0088` is Moneyheist's player on Book row 91. IDs are generated, never typed.

---

## 3. Daily KPI targets

| | Outreach | Active Leads | VIP Transfers | FTD |
|---|---|---|---|---|
| **Acquisition + VIP Team** | 100 | 20 | 3 | 1 |
| **Managers** (Prime, Daily) | 20 | 5 | 1 | 1 |

Editable on the **Team & KPI Targets** tab. Each rep's Stats tab reads their own row from it and shows today's actual against target — green when hit, yellow when short.

**Outreach** is a reference number, not tracked automatically. The other three are counted live.

---

## 4. A rep's file — the tabs

| Tab | What it's for |
|---|---|
| **Daily Task** | The work list. Opens first. This is the only tab a rep needs most days. |
| **Book** | Their full player database. One row per player. Everything else reads from here. |
| **Stats** | Personal scoreboard — totals, today vs target, week/month, status breakdown. |
| **FTD List** | Every player who has deposited. Auto-maintained. |
| **VIP Team** | Players handed to the in-house VIP team. |
| **Activity Log** | Every status change and completed task, dated. Powers week/month numbers. |
| **Lists** | The dropdown options and cadence table. Don't edit unless changing the funnel. |
| **Team & KPI Targets** | Their daily targets. |

---

## 5. The Book — what's typed vs automatic

**A rep types only these:**

Player Name / Handle · Source · Roobet Username · Status · KYC Status · Deposit Status · Weighted Wager · Notes · Transferred to VIP Team

**Everything else calculates itself:**

Player ID · Health · Priority · Date Assigned · Last Contact Date · Next Follow-Up Due · Next Action · VIP Ready · Follow-Up Attempts · plus hidden helper columns that drive the queues

Typing a Player Handle into a blank row triggers the rest: it stamps Date Assigned and Last Contact, sets Status to Initial Contact, and the row starts working.

**Health** is a glance indicator only — it does not decide order.

- **Yellow** — early funnel, on schedule
- **Green** — First Deposit or Active
- **Red** — 3+ days overdue, or Reactivation Queue
- **Black** — Dead Lead

---

## 6. The funnel

```
Initial Contact → Interested → VIP Transferred → KYC Complete → First Deposit → Active
                                    ↓
              Potential Lead (gone quiet) / Reactivation Queue / Dead Lead
```

| Status | Follow-up cadence | What the rep does |
|---|---|---|
| Initial Contact | 1 day | Day 1: check account, check KYC, help deposit |
| Interested | 1 day | Check account, check KYC, help deposit |
| VIP Transferred | Day 1 / 2 / 3 | Urgent — finish KYC, lock in first deposit |
| KYC Complete | 1 day | Help deposit / confirm pending |
| First Deposit | 3 days | Confirm playing, resolve issues |
| Active | 14 days | Periodic check-in, encourage play |
| Reactivation Queue | 3 days | Win-back outreach |
| Potential Lead | 7 days | Gone quiet — re-target without giving up |
| Dead Lead | 30 days | Re-target, see if anything changed |

**Potential Lead** exists so a rep can drop someone from daily grinding to weekly without writing them off.

---

## 7. Two different VIP things

These get confused. They're independent and can both be true at once.

**Status = "VIP Transferred"** — the player is being fast-tracked to a first deposit, including moving their VIP rank from another casino across to Roobet. Triggers **Day 1 / 2 / 3** urgent check-ins. Three attempts with no deposit flags them for Dead Lead.

**Transferred to VIP Team = "Yes"** — a separate column. The player has been handed to your in-house VIP team. Triggers **Day 1 / 7 / 14** check-ins, then goes quiet on its own. A player can be Active *and* mid this schedule.

The first is about converting them. The second is about who owns them.

---

## 8. The Daily Task tab

Three blocks, top to bottom.

**1. Today's queue** — anyone due today or overdue, longest-neglected first. Revived dead leads sit below live leads so they can't bury fresh work.

**2. Coming Up** — due within the next 7 days. Visibility only, nothing to action.

**3. Dead Lead Reactivation** — every dead lead, soonest retarget first. Red when due. A rep can work this list whenever they like.

**The daily loop:**

1. Rep works top to bottom, ticks **Task Complete**
2. Script stamps Last Contact = today, logs it, bumps the follow-up counter
3. Next Follow-Up recalculates from the cadence
4. The player drops out of today's queue
5. They come back when their next date lands

**Status and Notes are editable directly on Daily Task** — both write back to the Book. No need to open it.

A player with **no Roobet Username** stays in the queue every day until they sign up — it's the single biggest blocker. At 3 attempts, Next Action flags them ready for Dead Lead, but marking it stays the rep's call.

---

## 9. The Master Dashboard

| Tab | Shows |
|---|---|
| **Executive Dashboard** | Today / week / month against target, company-wide |
| **Master Player DB** | Every player, every rep, one list |
| **VIP Pipeline** | Everyone in VIP fast-track or with the VIP team. Missing Roobet username flagged yellow, overdue hand-offs red |
| **Master FTD List** | Every depositor, all reps |
| **Overdue Follow-Ups** | Anyone 24h+ past due, any rep |
| **Team & KPI Targets** | All targets in one table |

Hidden `_Import` tabs are the mirrors. Don't edit them.

**Refresh:** FIX EVERYTHING, or hourly auto-sync. **Show Status** tells you when it last ran and whether every rep is linked.

---

## 10. Capacity

| | Limit |
|---|---|
| Players per rep | 1,000 |
| Today's queue | 300 shown |
| Coming Up | 150 shown |
| Dead Lead Reactivation | 300 shown |
| Activity Log | 20,000 events |
| FTD List | 200 per rep |
| Master reach | 1,000 rows per rep |

Each Daily Task block shows a live count of how many qualify versus how many fit, so if a list ever outgrows its space it says so in plain English rather than hiding people.

**FTD List is the one still at 200.** Nobody is close. Raising it means moving a Total row in every rep file and the Master's pull in step — worth doing carefully, later.

---

## 11. Maintenance — the menu

**Daily Gamba Tools**, in each rep file.

| Item | When |
|---|---|
| **RUN FULL SETUP** | Once per rep, after pasting a new script version |
| **Check Everything** | Any time. Reports problems, changes nothing |
| **Repair Book Rows** | A row looks wrong — blank Player ID, no dropdowns, missing Next Action |
| **Reset VIP Check-in Clock** | VIP players stuck permanently overdue |
| **Widen Stats + Clean Dates** | Stats reading 0 on a day with real activity |
| **Repair & Rebuild FTD List** | FTD List doesn't match the Book |
| **Set This Sheet's Time Zone** | Rep is in a different country to the sheet |
| **Clean Up Deleted Leads** | Activity Log has entries for players no longer in the Book |

**On the Master:** FIX EVERYTHING, Show Status.

---

## 12. Things that will bite you

**Never delete cells with "shift up/left."** Select the whole row and delete the row, or clear contents. A partial shift corrupts formulas into `#REF!`, and because the ranking formulas scan the entire column, one bad row breaks the whole queue for everybody. Fix: Repair Book Rows.

**Never delete a row inside an FTD List tab.** It drags the Total row up into the data. Use Repair & Rebuild FTD List.

**Add columns at the end, never in the middle.** Formulas reference columns by letter — inserting one mid-sheet points every formula at the wrong thing.

**The sheet's time zone decides what "today" means** for both stamped dates and every `TODAY()` formula. A rep in another country needs their sheet set to their own zone or their morning work gets yesterday's date.

**The VIP Day 1/2/3 clock counts from the transfer date, not last contact.** If a rep falls a fortnight behind, all three check-ins expire before anyone works them, and those players land permanently overdue and one tick from auto-flagging as Dead Lead. Reset VIP Check-in Clock clears the backlog. *This will recur until the cadence is re-anchored to last contact — a known outstanding change.*

---

## 13. Adding a new rep

1. Build their file from the build script with their name, code and default source
2. Add their row to Team & KPI Targets
3. Paste the current script into their file, run RUN FULL SETUP
4. On the Master, run FIX EVERYTHING — it asks for the new sheet's link once and remembers it

---

## 14. Known open items

- **FTD List capped at 200** per rep — fine for now, needs care when raised
- **VIP cadence anchoring** — resets clear the backlog but it recurs; permanent fix is to count from last contact
- **Master daily counts** depend on clean dates in the Books — run Widen Stats + Clean Dates on every rep before trusting today's numbers
