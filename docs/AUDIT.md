# Scoping audit

Written after Prime's own Stats page showed 244 players. He has one.

The question this answers: **for every query, is the data limited to the person
looking at it?** It was prompted by two bugs found by using the app rather than
by reviewing it, which is the wrong way round.

## What went wrong, and why review missed it

Two mistakes, both the same shape.

**1. `player_counts_by_status()` counted the whole company.** No owner filter,
and `security definer` — which is precisely what *bypasses* row-level security.
The call site carried this comment:

```ts
// RLS scopes this to the viewer's own players
```

Confidently wrong. Every rep's personal Stats page was showing the company's
book composition — not names, but the size and shape of everyone's pipeline.

**2. Deleted players kept counting.** `activity_log.player_id` is
`on delete set null`, so deleting a player leaves their "lead added" and
"contact logged" rows behind, still credited to the rep. Beyond a stale number,
that is a way to inflate KPIs: add fifty players, take the credit, delete them.

Both were invisible to reading the code, because the code *said* it was
handled. A comment asserting a guarantee is not a guarantee.

## The rule that keeps being relearnt

> **RLS answers "may I see this". It does not answer "is this mine".**
> And `security definer` does not even ask.

This is the third time in this project: the Today queue, the admin Outstanding
column, and now the Stats funnel. Every time it looked different and was the
same thing.

## What was checked

Every query and function that reads player or activity data.

### `security definer` functions — do they take an owner?

| Function | Scoped by | Verdict |
| --- | --- | --- |
| `player_counts_by_status` | `p_owner` | **fixed** — took nothing |
| `player_counts_by_source` | `p_owner` | **fixed** — took nothing |
| `churn_players` | `p_owner` | ok, now required at the call site |
| `wager_report_rows` / `_totals` | `p_owner` | ok |
| `wager_period_by_rep` | returns owner, admin pages only | ok |
| `player_counts_by_owner` | returns per owner, admin only | ok |
| `wager_*_history`, `wager_ledger_latest`, `wager_first_seen` | company-wide by design, admin pages | ok |
| `unclaimed_wagerer_count` | company-wide by design | ok |
| `find_handle_owner` | **deliberately cross-book** | see below |

### Application queries

Every `players` / `activity_log` read in `lib/queries.ts`, `lib/book.ts`,
`lib/stats.ts`, `lib/calendar.ts` and `lib/churn.ts` filters on `owner_id` or
`user_id`. The one that does not — `getPlayerTimeline` — filters by player, and
`activity_log`'s RLS keys off `user_id`, so a rep asking about someone else's
player gets an empty list.

### API routes

| Route | Guard |
| --- | --- |
| `/api/export` | rep pinned to own book whatever the URL says |
| `/api/wager-report` | rep forced to `owner = me.id` |
| `/api/wager-range`, `/api/wager-sync`, `/api/wager-backfill`, `/api/wager-sync/ensure` | admin only |
| `/api/messages/[id]`, `/api/timeline/[id]` | signed in, then RLS by player ownership |
| `/api/notifications`, `/api/notifications/count` | RLS by `user_id` |
| `/api/cron/wager-sync` | `CRON_SECRET`, and refuses to run if unset |

### The deliberate exception

`find_handle_owner` answers across every book on purpose: when a rep types a
handle that already exists elsewhere, they are told whose it is. That leaks a
name and a reference to a rep who typed an exact match. The alternative is
silently losing the duplicate check, which is worse — two reps working the same
player and both expecting commission. Documented at the function.

## What changed structurally

`getChurn` and `getFunnelStages` now **require** an owner. Passing `null` means
company-wide and has to be typed out.

They were optional, and optional means a forgotten argument silently widens
scope to everyone. That is exactly how the 244 happened. Now forgetting is a
compile error and "everyone" is a deliberate act.

## What this audit does NOT cover

Stated plainly, because an audit that implies more than it checked is worse
than none:

- **Correctness of calculations.** Whether the funnel counts the right
  statuses, whether wager maths is right. Only scoping was checked.
- **The sync's own writes.** It runs as service-role by design.
- **Anything that has not been run.** Every finding here is from reading code
  and schema, and reading code is what missed both original bugs. The only
  real proof is signing in as a rep and looking.

## The one test worth doing by hand

Sign in as a rep — not an admin, not "view as" — and check:

1. **Stats** — funnel totals match their book size, not the company's
2. **Today** — only their players
3. **Book** — only their players, and the counts on the filter chips agree
4. **Calendar** — only their follow-ups

Four pages, two minutes, and it proves what no amount of code reading did.
