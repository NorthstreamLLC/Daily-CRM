# Keeping wager data current

## What the numbers mean now

Every period figure — today, this week, this month, all time, and every past
month — is a **fact Roobet returned for that exact UTC window**, not a
difference between two readings.

That distinction is why "August" was showing $0 next to $80m all time: the old
approach needed a snapshot from before 1 August and one from now, and there was
no "before". Roobet's endpoint accepts `startDate` and `endDate`, so the window
is simply asked for. Every figure is right on the **first** sync.

Periods are UTC because Roobet reports in UTC. A month here is the same month
the affiliate panel shows and commission is paid on.

Stored in `wager_periods`, one row per `(username, source, period_type, period_start)`.

## Three things keep it current

1. **Scheduled cron** — `/api/cron/wager-sync`, configured in `vercel.json`.
   This is the engine. Runs whether or not anyone is logged in.
2. **Keep-fresh check** — `/api/wager-sync/ensure`. Whenever an admin has the
   Wager page open, it checks how old the newest source is and syncs if it is
   over 20 minutes stale. Admin-only, session-authenticated, and it claims the
   window before working so two open tabs cannot both fire.
3. **Manual button** — Admin → Settings → Wager sources, for when you want it now.

All three run the identical core in `lib/wager-sync.ts`, so they cannot drift
apart.

## Setting up the cron

Set `CRON_SECRET` in Vercel → Project → Settings → Environment Variables to any
long random string. **Without it the endpoint refuses to run at all** — an open
sync URL would let anyone on the internet hammer the Roobet API using your keys.

### Plan limits matter here

`vercel.json` currently asks for every 30 minutes:

```json
{ "path": "/api/cron/wager-sync", "schedule": "*/30 * * * *" }
```

- **Vercel Pro / Enterprise** — fine, runs every 30 minutes.
- **Vercel Hobby** — cron is limited to **once per day**, and anything more
  frequent **fails the deployment** with "Hobby accounts are limited to daily
  cron jobs." If you deploy on Hobby, change the schedule to something daily,
  e.g. `"0 6 * * *"`, and lean on the keep-fresh check for intra-day updates.

Any external scheduler works too — the endpoint accepts GET or POST with
`Authorization: Bearer <CRON_SECRET>`.

## Loading history

Admin → Settings → Wager sources → Backfill. Give it the month you joined
Roobet. It walks month by month, asks Roobet for each window, and writes each
one as a month fact. Idempotent — running it twice cannot double anything.
