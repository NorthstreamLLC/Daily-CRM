# Who can do what, and why

The rules that are easy to get wrong later because they look arbitrary from
the outside. Every one of them is enforced in the database, not only in the
interface — the interface just explains them.

## Players

| Action | Rep | Admin |
| --- | --- | --- |
| See | Own book only | Everyone |
| Add / edit | Own book | Everyone |
| Change status | Own book | Everyone |
| **Assign to another rep** | **No** | Yes |
| **Delete** | Own, **while no wager and no first deposit** | Anything |

### Why a rep cannot assign

Commission is paid per rep on their players' wagering. If a rep could assign,
a rep could take a player who was never theirs and be paid for someone else's
work. Admin assigns, or the rep types the Roobet username on a player they
added themselves.

There is deliberately no "claim" or rotation feature for the same reason.

### Why a rep *can* delete, but only sometimes

A rep adds someone, finds out it's a scammer, or types the same person twice.
Making them ask an admin to remove a row they created five minutes ago is
friction with no purpose, and the row sits in their queue until somebody gets
round to it.

But a rep who could delete *any* of their players could delete one who had
wagered — by mis-click, or to bury a mistake — and that is unrecoverable money.

So the line is **money, not ownership**:

- no wager recorded **and** no first deposit → the rep can delete it
- anything else → admin only

Which is precisely the set of rows a rep actually wants gone. A scammer, a
duplicate and a typo have all wagered nothing. A player who has produced money
is by definition none of those.

Enforced by the `players_delete` policy (migration 026). The action checks the
same rule first, so a blocked row gets a sentence explaining itself instead of
silently not being deleted — which is the worst outcome, because a partial
delete reporting a cheerful count looks like it worked.

**Every deletion is recorded** in `admin_audit` with the handle, reference,
Roobet username, status and owner, captured *before* the delete. Afterwards
there is nothing left to name, and "where did they go?" does get asked.

Migration 026 also widened the audit insert policy to any authenticated user.
It previously required `is_admin()`, which would have meant rep deletions —
the only ones that now happen without an admin present — were the ones that
went unrecorded, with no error anywhere. Reading the audit is still admin
only, and nothing can update or delete it.

## Accounts

| Action | Rep | Admin |
| --- | --- | --- |
| Deactivate | No | Yes |
| Delete | No | Only if the account has **no** players, activity or messages |

### Someone leaves, or is fired

**Do not delete them.** Move their book, then Deactivate.

Their activity log is who contacted which player and when, and commission is
argued from it. Deleting a departed rep silently rewrites the history of
players still sitting in someone else's book. The database already refuses:
`players.owner_id`, `activity_log.user_id` and `messages.user_id` are all
`on delete restrict`. The action refuses first, in a sentence, rather than
letting it surface as a foreign key violation.

Delete exists for test accounts. That is the whole use case.

### Deactivation has two locks, on purpose

1. **The Supabase login is banned** — applied with the service-role key.
2. **The CRM refuses them** — the app layout checks `active` and shows an
   "Access removed" page.

The second exists because the first depends on `SUPABASE_SERVICE_ROLE_KEY`,
which is optional. Without it the ban is silently skipped, and before this
nothing else checked: a fired rep would have been hidden from every dropdown
while still able to sign in and read their entire book. Deactivating without
the key now returns a warning naming exactly which lock did not turn.

It is rendered rather than redirected because middleware sees a valid session
and would bounce them straight back — an infinite redirect loop, which is how
this was first found with a different case.

### Residual gap, named rather than hidden

A deactivated user holding a still-valid session token could in principle call
a server action directly: RLS keys off `auth.uid()`, which stays valid until
the token expires. The service-role ban closes this properly (token refresh
fails), and the layout blocks the interface. The airtight version is an
`active` check inside the RLS policies themselves — a migration touching every
policy, not yet done.

## Wager figures

| Who | Sees dollar amounts |
| --- | --- |
| Admin | Always, including when viewing as a rep |
| Rep | Only if **Admin → Settings → "Show wager figures to reps"** is on |

Off by default. A rep who can see that one of their players wagered $400,000
has a number to negotiate with, and the conversation stops being about the
work. That is a commercial decision rather than a technical one, so it is a
setting an admin can flip — no deploy, no asking anybody.

**What goes away when it is off:**

- "What your players wagered" on the rep's own Stats page
- the **Wagered** column in the Book — removed from the column list entirely,
  not blanked, or the header would still offer to sort by a figure that is not
  there
- the amounts in **Falling away**. The list itself stays, and so does the
  ranking: a rep still sees *who* has gone quiet and by what percentage, just
  not what they were worth. Losing the list would cost them work they should
  be doing; losing the figure costs them nothing.
- the wager CSV, **refused at `/api/wager-report`** rather than hidden. Hiding
  the button while the endpoint still serves the file is not a rule, it is a
  suggestion — and the URL is guessable.

Admins are unaffected everywhere, including the Wager page, which is admin-only
in the first place.

## Grants, and why revoking from `public` is not enough

Supabase ships default privileges that grant every new table and view in the
`public` schema to **both** `anon` and `authenticated`, automatically, at the
moment the object is created. Those are *direct* grants, and a direct grant
survives `revoke ... from public`.

So this, which looks careful, is not:

```sql
revoke all on public.some_view from public;
revoke all on public.some_view from authenticated;
```

`anon` is still granted. `anon` is the role behind the publishable key, which
ships inside the browser bundle of every page — signed in or not. Revoking the
role that requires a login while leaving the one that does not is the worst
possible half of the job.

**Name all three, every time:**

```sql
revoke all on public.some_view from public, anon, authenticated;
```

Migration 043 fixed exactly this on `player_by_roobet` and prints every
remaining `anon` grant in `public` when it runs, so the next one shows up in
the output rather than in an advisor alert.

### Views: invoker unless there is a reason

| View | Mode | Why |
| --- | --- | --- |
| `players_enriched` | `security_invoker = true` | Read directly by reps. Must obey RLS. |
| `player_by_roobet` | `security_invoker = true` | Read only from inside definer functions, which already bypass RLS as their owner. Invoker costs those callers nothing and means a stray grant no longer leaks the company's book. |

A `security definer` view does not ask whether you may see a row. If one is
genuinely needed, its safety rests entirely on its grants — which is a single
point of failure, and the one that failed here.
