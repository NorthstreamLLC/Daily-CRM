# Daily Gamba CRM

Replacing a 13-file Google Sheets CRM with a proper application.

Twelve reps work a shared funnel: find players, get them onto Roobet, get them to a first deposit, keep them playing, hand the valuable ones to an in-house VIP team.

---

## Where things stand

**Live today:** the spreadsheet system, still in daily use by 12 reps. Code for it is under `legacy/`.

**Being built:** this repo. Next.js + Supabase + Vercel.

---

## Layout

```
docs/
  BUILD_SPEC.md               what we're building, and why. Start here
  CURRENT_SYSTEM_HANDBOOK.md  how the live spreadsheet system works today

supabase/
  migrations/
    0001_initial_schema.sql   six tables, RLS, funnel cadences seeded

legacy/
  apps-script/                Google Apps Script running the live sheets
    DailyGamba_AppsScript_v45.gs   current rep script (all 12 rep files)
    RESET_vip_clock.gs             standalone fix, now folded into v45
    superseded/                    version history and one-off repair tools
  build-scripts/              Python that generated the spreadsheets
    build_crm2_mini.py             rep files. Source of truth for the funnel
    build_master_dashboard.py      master dashboard
```

**Not in here:** the Master Dashboard's own Apps Script, which lives in that spreadsheet under Extensions → Apps Script. Copy it out from there if you need it — the sheet is the authoritative copy.

---

## Build stack

| | |
|---|---|
| Database + auth | Supabase (Postgres, row-level security) |
| App | Next.js |
| Hosting | Vercel |

**Two roles.** `user` sees only their own players — enforced in the database, not just hidden in the UI. `admin` uses the CRM identically, plus master, VIP transfer and FTD views across the company.

---

## Setup

1. Supabase → SQL Editor → run `supabase/migrations/0001_initial_schema.sql`
2. Authentication → Users → create the 12 logins
3. Run the seed (next file, not written yet) to link users, codes, timezones and KPI targets
4. Import existing player data per rep from CSV

---

## Design decisions worth knowing

**Cadences are data, not code.** The `statuses` table holds each stage's follow-up interval. Change "Dead Lead = 30 days" in the UI and every date recalculates. No deploy.

**Next-due date is computed on read**, in the `players_enriched` view. Never stored, so it can never go stale or need repairing.

**Every number counts from `activity_log`,** not from a player's current status. Correct a mistake and it drops out of the totals. The spreadsheet counted every time a player was *ever* marked, so a rep who closed 5 deals showed 9.

**Timestamps are UTC, each user has a timezone.** "Today" resolves in the rep's own zone. A rep in Johannesburg logging at 7am gets that day, not yesterday.

**A completed task must leave the queue.** The due rule excludes anyone contacted today. Without that, ticking a task did nothing visible — a real bug in the spreadsheet, and acceptance test #1 in the spec.

---

## Lessons carried over from the spreadsheet

These are in `docs/BUILD_SPEC.md` §10 as acceptance tests. Each one is a bug that actually happened.

- A completed task leaves today's list and returns when next due
- Completing the same player twice in a day doesn't double count
- A player with no Roobet username surfaces every day until it's filled
- A corrected status change decreases today's count
- VIP check-in schedules can't silently expire while nobody's looking
- One rep can't see another rep's players

---

## What isn't being rebuilt

Roughly 3,400 lines of Apps Script exists to survive being a spreadsheet — hidden ranking columns, mirror tabs, IMPORTRANGE, `#REF!` repair tools, capacity expanders. None of it survives the move to a database. `docs/BUILD_SPEC.md` §2 lists it.

The CRM logic itself is small. The complexity was never in the domain.
