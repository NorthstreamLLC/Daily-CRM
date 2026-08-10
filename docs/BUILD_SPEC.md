# Daily Gamba CRM — Build Spec

A specification for rebuilding the spreadsheet CRM as a proper application. Written to be handed to a developer, or used as a working plan.

Business rules here are lifted from the working system, not invented. Where the spreadsheet does something because it *had* to, that's marked — those parts should not be recreated.

---

## 1. What we're building and why

Twelve reps work a shared funnel: find players, get them signed up on Roobet, get them to a first deposit, keep them playing, hand the valuable ones to an in-house VIP team. It currently runs on 13 Google Sheets and works, but the spreadsheet is the ceiling.

**What fails today, all of it structural:**

| Problem | Cause |
|---|---|
| Numbers silently wrong | Fixed ranges (`A4:O203`). Anything past the limit vanishes with no error |
| Data stops syncing | IMPORTRANGE truncates and caches unpredictably |
| Formulas corrupt | One "delete cells → shift up" turns a formula into `#REF!` and breaks a whole column |
| Constant maintenance | Repair/expand tools exist purely to undo spreadsheet damage |
| No real permissions | Anyone with the link can edit anything |
| Wrong dates across countries | "Today" depends on a per-file time zone setting |
| No history | Nothing records what changed, when, or who did it |

None of these are CRM problems. They're all spreadsheet problems, and they disappear with a database.

**Goals for the new build:**

1. Correct by construction — no repair tooling, no capacity limits, no silent truncation
2. Every rep gets a live personal dashboard
3. Company-wide numbers always match what reps actually did — no sync step
4. Scales to hundreds of reps and hundreds of thousands of players
5. Adding a rep is a click

---

## 2. Do not rebuild these

These exist only to work around Sheets. Recreating them would be a mistake.

| Spreadsheet artifact | In the new system |
|---|---|
| Hidden helper columns — DueFlag, DueRank, ReactFlag, ReactRank, UpcomingFlag, UpcomingRank | A query with `WHERE` and `ORDER BY` |
| Match Row plumbing on Daily Task | Foreign key |
| `_Import` mirror tabs, IMPORTRANGE | One database. Nothing to mirror |
| Separate FTD List and VIP Team tabs | Filtered views of the players table |
| StatusNextFollowUp / VIPTeamNextFollowUp helper columns | Computed at read time, or a single scheduled job |
| Per-sheet time zone | UTC timestamps, per-user time zone for display and "today" |
| Row capacity constants, expand tools | Nothing to expand |
| Repair Book Rows, Check Everything, Expand Everything, Reset VIP Clock | Not needed — a database row can't lose its formulas |

**Roughly 3,400 lines of Apps Script becomes almost nothing.** Most of it is repairing spreadsheet damage.

---

## 3. Data model

### users
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | Tuna, Plat, Chella… |
| code | text | TU, PL, CH — prefix for player reference numbers |
| email | text | login |
| role | enum | `acquisition`, `vip_team`, `manager`, `admin` |
| timezone | text | IANA, e.g. `Africa/Johannesburg`. Drives their "today" |
| default_source | text | pre-fills on new players |
| active | bool | |

### kpi_targets
| Field | Type |
|---|---|
| user_id | uuid |
| outreach_per_day | int |
| active_leads_per_day | int |
| vip_transfers_per_day | int |
| ftd_per_day | int |
| effective_from | date |

Keep history rather than overwriting — changing a target shouldn't rewrite the past.

### players
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| reference | text | `MH-0088`. Generated, immutable, never reused |
| owner_id | uuid | → users |
| handle | text | required |
| source | enum | Instagram, Discord, Twitter, Telegram, SlotEssentials, Other |
| roobet_username | text | nullable — **null is a blocker, see §5** |
| status | enum | see §4 |
| kyc_status | enum | Not Started, Started, Complete, Failed |
| deposit_status | enum | No, Pending, Yes |
| weighted_wager | numeric | |
| notes | text | |
| assigned_at | timestamptz | set on create |
| last_contact_at | timestamptz | set on every logged contact |
| followup_attempts | int | resets to 0 when roobet_username is filled |
| vip_fasttrack_started_at | timestamptz | null unless status has been VIP Transferred |
| vip_fasttrack_checkins | int | 0–3 |
| vip_team_handed_at | timestamptz | null unless handed to VIP team |
| vip_team_checkins | int | 0–3 |
| first_deposit_at | timestamptz | set when status first reaches First Deposit or Active |
| created_at / updated_at | timestamptz | |

**Indexes:** `(owner_id, status)`, `(owner_id, last_contact_at)`, `first_deposit_at`.

### activity_log
Append-only. Never edited, never deleted.

| Field | Type |
|---|---|
| id | uuid |
| player_id | uuid |
| user_id | uuid |
| event_type | enum | `outreach`, `status_change`, `task_completed`, `vip_fasttrack_checkin`, `vip_team_checkin`, `note_added`, `player_created` |
| from_status / to_status | enum, nullable |
| occurred_at | timestamptz |
| metadata | jsonb |

This is the source of truth for every historical number. Today/week/month roll up from here, not from the current state of a player.

---

## 4. The funnel

```
Initial Contact → VIP Transferred → First Deposit → Active
                         ↓
     Potential Lead  /  Reactivation Queue  /  Dead Lead
```

| Status | Cadence | Next action shown to the rep |
|---|---|---|
| Initial Contact | 1 day | Check account, check KYC, help them deposit |
| VIP Transferred | **see §6** | Urgent — finish KYC, lock in first deposit |
| First Deposit | 3 days | Confirm playing, resolve issues |
| Active | 14 days | Periodic check-in, encourage play |
| Reactivation Queue | 3 days | Win-back outreach |
| Potential Lead | 7 days | Gone quiet — re-target without writing off |
| Dead Lead | 30 days | Re-target, see if anything changed |

**Two stages were dropped from the spreadsheet version.** *Interested* had the same
cadence and the same next action as Initial Contact — it described a feeling, not a
stage. *KYC Complete* duplicated the `kyc_status` field every player already carries,
putting the same fact in two places that could disagree.

Cadences must be **configurable data**, not code constants.

**`next_followup_at` = `last_contact_at` + cadence(status).** When a VIP schedule is also running, whichever is sooner wins.

---

## 5. The daily queue — the core of the product

Each rep's day is one screen, three lists.

### List 1 — Due now

```
owner_id = :me
AND status != 'Dead Lead'                        -- dead leads have their own list
AND NOT contacted_today                          -- CRITICAL, see below
AND (
      next_followup_at <= end_of_today(:my_tz)
   OR roobet_username IS NULL                    -- the permanent blocker
)
ORDER BY last_contact_at ASC NULLS FIRST         -- longest neglected first
```

**`NOT contacted_today` is not optional.** Without it a completed task never leaves the list. This was a real bug in the spreadsheet: reps ticked the same player repeatedly and nothing moved. `contacted_today` means `last_contact_at` falls within today *in the rep's own time zone*.

**Missing Roobet username keeps a player in the queue every single day** until it's filled. It's the single biggest conversion blocker. At 3 attempts the UI flags "ready for dead lead" as a prompt — it must not auto-change the status. The rep decides.

### List 2 — Coming up
Not due yet, due within 7 days. Read-only. Visibility, not action.

### List 3 — Dead lead reactivation
All dead leads, soonest retarget first, highlighted when due. Workable any time, deliberately separate so a 30-day-old dead lead never outranks a hot lead.

When a dead lead's 30 days lands they *also* enter List 1, but ranked **below** all live leads.

### Completing a task
One action. Must be atomic:

1. `last_contact_at = now()`
2. Append `task_completed` to activity_log
3. If `roobet_username IS NULL` → `followup_attempts += 1`
4. If a VIP schedule is running → increment that counter
5. Recompute `next_followup_at`

The player leaves the list immediately. They return when next due.

---

## 6. The two VIP flows

These are independent and can run at the same time on the same player. Conflating them is the most common misunderstanding.

**VIP fast-track** — `status = 'VIP Transferred'`. The player is being pushed to a first deposit, including moving their VIP rank from another casino to Roobet. Check-ins at **Day 1, 2, 3**. After 3 with no deposit, flag for Dead Lead — *prompt only, rep confirms*.

**VIP team hand-off** — a separate flag. The player has been handed to the in-house VIP team. Check-ins at **Day 1, 7, 14**, then stops automatically. Can run while status is Active or anything else.

### Fix this in the rebuild

The spreadsheet anchors both schedules to **when the flow started**. If a rep falls two weeks behind, all three check-ins expire before anyone works them, and the player sits permanently overdue and one click from being auto-flagged dead. That happened, and needed a manual clock-reset tool.

**Anchor to `last_contact_at` instead.** Day 1 then means "a day after you last spoke to them," which is what it was always meant to mean, and it cannot silently expire.

---

## 7. Dashboards

### Rep dashboard — their landing screen
- Today vs target: Active Leads, VIP Transfers, FTDs — green when hit, amber when short
- The three queue lists, worked inline
- This week / this month, with trend
- Their pipeline by status
- Their FTD list and total weighted wager

Everything live. No refresh button, no sync step.

### Manager / admin
- Everything above per rep, plus company totals
- All players, filterable by rep, status, source, date
- VIP pipeline company-wide, with missing usernames and overdue hand-offs flagged
- Overdue follow-ups across all reps
- Target management

### Definitions — must be exact
- **Active Leads (today)** — players whose `assigned_at` is today, excluding Dead Lead and Potential Lead
- **VIP Transfers (today)** — players who *entered* VIP Transferred today, or were handed to the VIP team today
- **FTD (today)** — players whose `first_deposit_at` is today

Count from **activity_log**, not from current state. A player corrected out of a status later must drop out of the count. The spreadsheet got this wrong for months: it counted every time someone was *ever* marked, so a mistake corrected the next day still counted forever. A rep closing 5 deals showed 9.

---

## 8. Permissions

| Role | Can see | Can edit |
|---|---|---|
| Acquisition / VIP team | Own players only | Own players |
| Manager | All | All players, targets |
| Admin | All | Everything, users, cadences |

Enforced server-side. Reps having no way to see each other's books is a real requirement, and something the current setup can't actually guarantee.

---

## 9. Non-functional

**Time zones.** Store UTC. Every user has their own. "Today", "due", and all daily counts resolve in *that user's* zone. A rep in Johannesburg logging at 7am gets that day, not yesterday. This was a live bug.

**Audit.** Every change writes to activity_log with who and when. Nothing is destructive.

**Scale.** Hundreds of reps, hundreds of thousands of players. Queue queries stay indexed and paginated. No fixed limits anywhere.

**Mobile.** Reps work from phones. The queue and complete-task flow must work properly on a small screen.

**Offline tolerance.** Completing a task should survive a dropped connection and sync when it returns.

---

## 10. Acceptance tests

The rules most likely to be got wrong. Each of these is a bug that actually happened.

1. Complete a task → player leaves today's list immediately, reappears when next due
2. Complete the same player twice in a day → second does nothing, no double count
3. Player with no Roobet username → appears every day regardless of contact date
4. Fill in the username → attempts reset to 0, normal cadence resumes
5. Dead lead 30 days up → appears in the daily queue, ranked below every live lead
6. Rep in Johannesburg logs at 07:00 local → counted for that local day
7. Status set to First Deposit, then corrected back → today's FTD count decreases
8. VIP fast-track: 3 check-ins, no deposit → flags for review, does **not** auto-change status
9. VIP team hand-off runs while status is Active → both schedules tracked, neither interferes
10. Rep A cannot see or query Rep B's players
11. 1,000 players on one rep → queue loads fast, nothing truncated
12. Change a cadence → future dates use it, past history unchanged

---

## 11. Migration

1. Export all 12 Books, FTD Lists and Activity Logs to CSV
2. Map: Player Handle → handle, Status → status, dates → timestamptz **in that rep's zone**
3. Recreate `reference` from rep code + sequence, preserving existing IDs so nothing renumbers
4. Backfill activity_log from the existing logs — this preserves week/month history
5. Derive `first_deposit_at` from the earliest First Deposit event per player
6. Reconcile: player count, per-status count and FTD count per rep must match the sheets exactly before cutover
7. Run both in parallel for a week, compare daily numbers, then switch

Step 6 is not optional. It's the check that would have caught most of what went wrong this year.

---

## 12. Suggested phases

**Phase 1 — the loop.** Users, players, statuses, the due-now queue, completing tasks, activity log. One rep uses it for real.

**Phase 2 — full replacement.** Coming up, dead lead reactivation, both VIP schedules, FTD tracking, rep dashboards, manager views, permissions. Migrate everyone.

**Phase 3 — beyond the spreadsheet.** Notifications, mobile, reporting, bulk import, Roobet integration if their API allows it.

Phase 1 is small. The domain is genuinely simple once the spreadsheet scaffolding is stripped out — the complexity was never in the CRM.
