# Why the app felt slow, and what was done

Written up because the fixes live in places that cannot hold a comment —
`vercel.json` has no comment syntax, and "why is there a loading.tsx" is not
obvious from the file itself.

## The complaint

> The site is still very very very slow, each click takes 2-3 seconds.

Three separate causes, in descending order of how much they mattered.

---

## 1. The functions ran on the wrong side of the country

Supabase is in **us-west-2 (Oregon)**. Vercel's default function region for a
new project is **iad1 (Washington DC)**. Every query the app makes was
crossing the continent and coming back — roughly 60–70ms of pure distance,
before the database did any work at all.

That cost is paid *per sequential round trip*, and a page like Today makes
several. It is not a slow query. It is a fast query sent a long way.

The fix is one line in `vercel.json`:

```json
"regions": ["pdx1"]
```

`pdx1` is Portland, Oregon — the same place as `us-west-2`. The distance
becomes about a millisecond.

**If the Supabase project ever moves region, this line has to move with it.**
That is the whole reason this document exists. The two settings are coupled
and nothing in either dashboard will tell you so.

Region changes only take effect on a **new deployment**.

## 2. Nothing on screen changed when you clicked

Every page is `force-dynamic`, so it cannot render until the server has
finished querying. Next.js's default behaviour in that situation is to keep
the **old page on screen, frozen**, until the new one is completely ready.

So a 700ms render and a broken app look exactly the same from the outside,
and the honest description of both is "each click takes 2-3 seconds".

Adding `loading.tsx` files changes the click from "nothing happens, then the
page appears" to "the page changes immediately, then fills in". The server
work takes just as long. The app stops feeling like it has hung.

- `app/(app)/loading.tsx` — the fallback every route inherits
- `app/(app)/today/loading.tsx` and `book/loading.tsx` — tailored, because a
  skeleton that settles into a different shape than the content replacing it
  reads as a glitch

## 3. Small lookups were blocking big ones

Two pages awaited a single cheap query on its own line, then started
everything else:

- **Today** awaited `getSettings(...)` before its batch of eleven queries
- **Stats** awaited `getTargets(...)` before its batch of eight

In both cases only *one or two* of the queries below actually needed a value
out of the first one. Everything else was queuing behind a lookup it did not
care about, and paying a full extra round trip for the privilege.

The pattern now is: start the promise, chain only the queries that genuinely
depend on it, and await the whole lot together.

```ts
const settingsPromise = getSettings([...]);          // started, not awaited
const comingUpPromise = settingsPromise.then((s) => getComingUp(...));

const [settings, dueNow, comingUp, ...] = await Promise.all([
  settingsPromise, getDueNow(...), comingUpPromise, ...
]);
```

Earlier in the same pass, `auth.getUser()` was found to be running **twice per
navigation** — once in middleware to guard the route, once inside `getMe`
asking the question middleware had just answered. Middleware now forwards the
verified id on the request as `x-verified-user`.

> **Security note on that header.** It is `delete`d unconditionally when there
> is no verified user, not merely `set` when there is. Only setting it on the
> happy path would leave a forged header on a public route to pass straight
> through, and `getMe` would believe it. See the comment in
> `lib/supabase/middleware.ts`.

---

## What was deliberately not done

- **Caching the reference tables** (`statuses`, `sources`, `settings`) across
  requests. It would remove a couple of queries per render, but the obvious
  implementation reads them with the service-role client, and
  `lib/supabase/admin.ts` states the rule plainly: that key is never used to
  read application data. Worth revisiting with an approach that keeps RLS.
- **Raising the function memory** in `vercel.json`. The valid ceiling depends
  on the Vercel plan, and guessing wrong fails the build rather than degrading
  quietly. Set it in the dashboard where the allowed values are visible.

## How to tell whether it worked

Vercel → the deployment → **Functions**, or the response's `x-vercel-id`
header, which names the region that served it. It should say `pdx1`.

Watch out for **cold starts** when judging this: the first click after a few
minutes idle includes the function booting, which is its own second or so and
has nothing to do with any of the above. Judge from the second click onward.

---

# The 8.6 second wager page, and how it was actually found

Kept because the process matters more than the fix.

## What did not work

Three confident diagnoses, from reading code, all wrong:

1. **The Vercel region.** Flagged repeatedly as the likely cause. It was
   already `pdx1` and correct. Distance was never the problem.
2. **`wager_all_history`.** Looked expensive — aggregates every day, week and
   month row. Measured 616ms.
3. **The ledger downloads.** `getWagerOverview` fetched up to 300,000 rows
   twice per page load and folded them in JavaScript. Obviously wasteful, and
   a whole migration was written for it. Measured 539ms and 343ms.

Each theory was plausible. Each cost a deploy and a migration. None moved the
number.

## What worked

Printing the timings on the page.

```
overview 8710ms · extDay 8377ms · extWeek 8377ms · extMonth 8377ms ·
periods 616ms · churn 578ms · report 567ms · ledgerLatest 539ms · ...
```

Three identical timings, everything else under 620ms. One function, called
three times. It took one reload to find what a week of reading had missed.

## The bug

`wager_external_deltas` ran **three correlated subqueries per (username, code)
pair** — the baseline before the window, and the first and last readings
inside it.

The index matched perfectly. That is what made it invisible: it was not a
missing index, it was a shape that multiplies by the number of rows. About 860
pairs × 3 subqueries ≈ 2,600 index lookups per call, each re-evaluating the
row-security policy, three calls per page load.

Rewritten as three `DISTINCT ON` passes joined together. **8,719ms → 886ms.**

The identical pattern existed in `wager_deltas` over `wager_snapshots`, sitting
at a harmless-looking 507ms because there were 251 players. It was fixed at the
same time, along with the indexes that table had never had.

## The lesson

> A query shape that looks reasonable and multiplies by row count is invisible
> to code review and obvious to a stopwatch.

`RenderStamp` and `timed()` in `app/(app)/RenderStamp.tsx` are admin-only, cost
nothing, and stay. When something feels slow, read the footer before forming a
theory.

## What else came out of it

- **Nothing pruned `wager_snapshots`** — a row every 30 minutes per matched
  player per code, forever. `prune_wager_snapshots` now runs in the nightly
  cron. It keeps the most recent row per (player, source) regardless of age:
  that row *is* the player's all-time figure, so pruning it would silently zero
  the lifetime wager of anyone dormant.
- **The Wager page ran eleven queries to render three numbers**, two of which
  only answered "is there any data yet?" — which the period totals already
  answer. It now asks for the one count it needs.

## Where it stands

886ms across nineteen round trips, none dominant. The remaining lever is doing
fewer queries or caching them for the 30 minutes between syncs — not
optimisation, and not worth it until it hurts.
