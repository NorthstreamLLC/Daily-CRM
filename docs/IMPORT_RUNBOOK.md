# Importing the books

Thirteen books, 200–300 players each. Roughly 3,000–4,000 rows. Read this once
before starting.

## Do one book first, and stop

Import **one rep** — ideally the smallest book — then check the four things
below before touching the other twelve. An import can be undone as a unit
(Admin → Import → Undo), but undoing twelve of them one at a time after
noticing a systematic problem is a bad afternoon.

## The order

1. Rep exports their Book tab: **File → Download → CSV**, with the Book tab
   selected. Not the whole workbook — one tab.
2. Admin → Import → **choose whose book it goes into**, then choose the file,
   then **Check file**.
3. Read the problem list. Nothing has been written yet.
4. If it looks right, pick the same file again and Import.

The rep is chosen in step 1 on purpose: the check compares the file against
that book and against everyone else's, and it cannot do either without knowing
the destination.

## What the check will tell you

| Problem | What happens | Do something? |
| --- | --- | --- |
| No player handle | Row skipped | Fix the sheet if it matters |
| Duplicate within the file | Row skipped | No |
| Already in this book | Row skipped | No — re-running a file is safe |
| Also in another rep's book | **Imported anyway** | Yes — decide who owns them |
| Roobet username already used | **Imported anyway** | **Yes — fix before importing** |
| Old status name | Imported, renamed | No |
| Unknown source | Imported as text | No |
| Unreadable date | Imported, date left empty | Only if the date matters |

### The two that need a decision

**Same Roobet username on two players** is the expensive one. The wager sync
matches leaderboard entries to players by username, and a username can only
map to one player — so one of the two silently gets all the money and the
other gets nothing. Commission is paid from that figure. Resolve it in the
sheet before importing.

**Same handle in two books** usually means the same person was worked by two
reps. Not automatically wrong, but somebody should decide who owns them.

## What updates by itself afterwards

- **The Book** — immediately.
- **References** (MH-0001…) — assigned on insert; the counter is pushed past
  the import so the next manually added player does not collide.
- **Wager** — on the next sync, within 30 minutes. The sync reads every player
  who has a Roobet username, so imported players are picked up without doing
  anything, and a newly matched player has their back history copied across.
- **Status auto-advance** — a player who starts wagering moves to Active and
  their owner gets a notification.
- **Stats: funnel, pipeline, book size** — immediately, since they are counted
  from the players themselves.

## What does NOT update, and should not

**Today's activity numbers** — "active leads", "VIP transfers", "first
deposits" — count events in the activity log for *today*. An import creates
players, not contact events, so these stay where they are.

That is correct. If importing 300 historical players registered as 300 leads
generated today, every rep would appear to have smashed their daily target on
the day they were onboarded, and the number would be meaningless.

## If it goes wrong

Admin → Import → the batch list → **Undo**. Every row written by an import is
tagged with its batch id, so it comes out as a unit and leaves everything else
alone.

Undo removes the players it created. Anything that happened to those players
afterwards — notes, logged messages, wager readings — goes with them.
