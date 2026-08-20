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
