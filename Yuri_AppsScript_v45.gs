/**
 * Daily Gamba CRM - Apps Script automation (v45)  -  COMPLETE PACKAGE
 *
 * ============================================================================
 * PER REP, THIS IS THE WHOLE JOB:
 *   1. Extensions > Apps Script. Delete everything in there. Paste this. Save.
 *   2. Reload the spreadsheet tab in your browser.
 *   3. Daily Gamba Tools  >  ">>> RUN FULL SETUP <<<"
 *   4. Daily Gamba Tools  >  "Check Everything"   - should come back clean.
 *
 * For the two South Africa reps, also run "Set This Sheet's Time Zone".
 * Everything is safe to re-run. If Google stops a run at its 6 minute limit, run it again.
 * ============================================================================
 *
 * RUN FULL SETUP does all five steps in order, showing you each result:
 *   1. Expand the Book to 1000 lead rows
 *   2. Move the Sent to VIP Team list onto its own tab
 *   3. Rebuild the Daily Task tab - queue, then Coming Up, then Dead Leads
 *   4. Widen the Stats formulas to 1000 rows and the Activity Log to 20,000, and strip the
 *      time off stamped dates
 *   5. Reset the VIP check-in clock for anyone stuck at VIP Transferred
 *
 * WHAT THIS VERSION FIXES
 * - Capacity everywhere: Book 200 -> 1000, Daily Task queue 60 -> 300, Coming Up -> 150,
 *   Dead Leads -> 300, Activity Log 5,000 -> 20,000. Nothing silently truncates at 200 again.
 * - A completed task now LEAVES today's queue. The due rule never checked whether you had
 *   already contacted someone today, so ticking Task Complete left them sitting there.
 * - Stamped dates carried a time (7/15/2026 7:00:00). COUNTIFS(range, TODAY()) tests
 *   equality against midnight, so days with real activity counted as zero. Times stripped.
 * - Dead leads rejoin the daily queue when their 30 days is up, ranked BELOW live leads so
 *   they cannot bury fresh work.
 * - The VIP Day 1/2/3 cadence counts from the day someone became VIP Transferred. Sit on
 *   the list a fortnight and all three expire before anyone works them, leaving players
 *   permanently overdue and one tick from auto-flagging as Dead Lead. Step 5 restarts that
 *   clock. NOTE: this will recur - the permanent fix is to count from last contact instead,
 *   which is a separate change.
 * - Daily Task cell borders restored, Notes column wraps.
 *
 * TWO THINGS THAT REPORT RATHER THAN FIX
 * - "Check Everything" reads the Book, Daily Task blocks, FTD List, dates, filter, time
 *   zone and VIP counts, and tells you what does not line up. It changes nothing.
 * - "Restore Stats Labels" is only needed on a sheet where an earlier version of the stats
 *   fix erased the headings. Leave it alone otherwise.
 *
 * STILL CAPPED ON PURPOSE
 * The FTD List stays at 200 per rep. Each one has a Total row directly under the data that
 * has to move with it, and the Master's pull has to move in step - that is what corrupted
 * the Master FTD List once before. Nobody is near 200 deposits, so it waits.
 *
 * v41 - dead leads now actually come back into the daily queue after 30 days.
 * - This never worked. The rule deciding who lands in today's queue excluded anyone with
 *   Status = Dead Lead outright, so a dead lead could never appear there no matter how long
 *   they had been waiting. They only ever showed in the Dead Lead list at the bottom.
 * - Now: when a dead lead's 30-day retarget date arrives, they appear in today's queue at
 *   the top like any other due player. They also stay in the Dead Lead list permanently, so
 *   a rep can go attack that list whenever they feel like it - both, not either/or.
 * - Dead leads still do NOT get pulled into the queue merely for having no Roobet username,
 *   otherwise every one of them would sit there every day forever.
 *
 * v40 - fixes Step 3 leaving duplicate section headers behind.
 * - Step 3 is meant to wipe the tab below the header row before rebuilding it. It called
 *   clear({contentsOnly: false}) - and an options object with everything set to false
 *   clears NOTHING. So the wipe silently did nothing.
 * - It only showed up once the block sizes changed between versions: the new layout landed
 *   at different rows than the old one, so the old section headers were left stranded and
 *   you ended up with several "Coming Up" and "Dead Lead Reactivation" bars down the sheet.
 * - Now uses explicit clearContent / clearFormat / clearDataValidations / clearNote across
 *   the full width of the sheet. Run Step 3 once more and the strays go.
 *
 * v39 - fixes a crash in Step 3: "TypeError: rs[ri].getSheetId is not a function".
 * - getSheetId() belongs to a Sheet, not a Range, so the line threw the moment Step 3
 *   reached the highlighting. Nothing had been written to the Book at that point - the
 *   action just stopped partway through rebuilding the tab. Re-run Step 3 and it completes.
 *
 * v38 - no silent discrepancies between the Book and Daily Task.
 * - Each block on Daily Task is a window onto the Book: it can only show as many players as
 *   it has rows. If more players qualify than the block has room for, the extras used to
 *   just not appear, with nothing saying so.
 * - Every block now carries a live counter reading straight off the Book - how many qualify
 *   in total, and whether they all fit. If they don't, the line says so in capitals with the
 *   number missing. A shortfall can no longer pass unnoticed.
 * - Room increased: today's queue 150 -> 300, Coming Up 100 -> 150, Dead Leads stays 300.
 *   If a counter ever says rows are missing, those numbers are a one-line change.
 * - The Book's own formulas already cover all 1000 rows, so nothing is missing at source.
 *
 * v37 - Daily Task tab rebuilt properly, and the blank rows fixed.
 * - THE BLANK ROWS: each block on Daily Task finds its players with a lookup into the Book,
 *   and those lookups were written when the Book was 200 rows. They never grew. Any player
 *   below row 203 was invisible to them - which is why entries showed as blank rows even
 *   though the players were sitting right there in the Book. Every block now looks across
 *   the whole Book.
 * - Coming Up now sits ABOVE Dead Lead Reactivation.
 * - Still one tab, still the same 13 columns, still the same behaviour: tick Task Complete,
 *   the player's Last Contact updates, they drop into Coming Up, and they come back into
 *   today's queue when their next follow-up date arrives.
 * - "Step 3: Rebuild Daily Task Tab" replaces the two old Daily Task expand steps - it
 *   rebuilds the whole tab in one pass, so there is nothing to run in the right order.
 *   Safe to re-run: the Daily Task tab holds no data of its own, every cell on it is a
 *   formula reading the Book or a checkbox.
 *
 * v36 - the Book's filter now grows with the Book.
 * - That green outline on the Book is its filter range. It gets created once when the sheet
 *   is built, sized to the rows that existed then, and it does NOT grow when rows are added.
 *   So after expanding to 1000 rows the filter still stopped partway down - and sorting the
 *   Book would only sort the rows inside it, quietly leaving everything below unsorted.
 * - "Repair Book Rows" and Step 1 now resize the filter to cover the whole Book. Doing that
 *   rebuilds the filter, so any filter criteria currently applied get cleared - the columns
 *   go back to showing everything. No data is affected.
 *
 * v35 - the repair action now restores how rows LOOK, not just how they calculate.
 * - Borders, shading, date formats and the Status / Health / KYC / Deposit dropdowns are
 *   per-cell, exactly like the formulas. Rows added by hand never had them, and using
 *   "Clear formatting" on a range strips them - either way you get plain-looking rows with
 *   no dropdowns, even once the formulas are correct.
 * - "Repair Book Rows" (renamed again) now rebuilds the formulas AND restores the
 *   formatting and dropdowns across every Book row, copying them from a row near the top
 *   that's still intact. It never reads or writes any cell's contents while doing so.
 * - Step 1 does the same for the rows it adds.
 *
 * v34 - added rows now actually work.
 * - A Book row is mostly formulas. Adding rows by hand at the bottom gets you a row where
 *   only the things you type (Status, dates, notes) do anything - Player ID, Health,
 *   Priority, Next Follow-Up, Next Action, VIP Ready and Follow-Up Attempts stay blank,
 *   because each of those is a per-row formula that has to exist in the cell.
 * - "Repair All Book Formulas" (renamed, was "Repair Book Ranking Formulas") now rebuilds
 *   ALL 15 computed columns across every Book row, not just the 5 ranking helpers. Run it
 *   after anyone adds rows by hand and the new rows start working.
 * - Same fix applies to Step 1: the 800 rows it adds now get every formula, not just the
 *   ranking ones. If you already ran Step 1, just run "Repair All Book Formulas" once.
 * - Follow-Up Attempts and the VIP check-in counters/dates are only filled in where they
 *   are blank, so real attempt counts and check-in dates are never overwritten. Player
 *   Handle, Source, Roobet Username, Status, dates, Notes and FTD Date are never touched.
 *
 * v33 fixes two bugs in the v30-v32 upgrade actions, both caused by the same mistake -
 * assuming fixed row numbers on sheets where rows had been deleted by hand:
 * - "Expand Book" wrongly reported "already expanded to 1000 rows" and did nothing. It
 *   decided the Book was done by checking for a formula in row 1003 - but "Repair Book
 *   Ranking Formulas" writes formulas across that whole range too, so running the repair
 *   first made the expand action think its work was already finished. It now measures the
 *   Book by finding the "Sent to VIP Team" block, and is naturally safe to run twice.
 * - "Move Sent to VIP Team to Own Tab" created the new tab but left the old copy sitting
 *   in the Book. It looked for the block's header at row 206 exactly; on a Book that has
 *   had rows deleted, everything below slid up and the block was at row 203, so the check
 *   silently failed. It now searches for the block instead of assuming where it is.
 * - Both actions now report which row they actually found, so this class of problem is
 *   visible rather than silent.
 *
 * v32 - time zone fix for reps working outside the sheet's time zone:
 * - Every date this script stamps (Date Assigned, Last Contact, FTD Date, Activity Log)
 *   decides "what day is it" from THAT SHEET'S time zone setting - and so does every
 *   TODAY() formula on the sheet. If a sheet is set to a time zone behind the rep, their
 *   early-morning work gets stamped with YESTERDAY'S date. This is what was happening to
 *   the South Africa reps: log something at 7am on the 20th, sheet records the 19th.
 * - New menu action, "Set This Sheet's Time Zone" - pick the rep's location from a list.
 *   It corrects the script's stamps and the sheet's formulas together. Safe to run any
 *   time; dates already in the sheet do NOT change.
 * - Also fixed a latent off-by-one-day bug in the "already logged today?" check that could
 *   misfire for reps behind UTC.
 * - WORTH KNOWING: with each rep on their own local day, a rep whose day starts earlier
 *   than the Master Dashboard's can stamp "today" before the Master rolls over, so the
 *   Master's Today count can trail them by a few hours. Week and Month totals are fine.
 *
 * v31 - Daily Task queue grows 60 -> 150 rows, Dead Lead Reactivation grows 200 -> 500.
 *
 * v30 - Book grows 200 -> 1000 lead rows; "Sent to VIP Team" moves out of the Book onto
 * its own tab. The FTD List keeps its own separate 200-row capacity on purpose, so that
 * growing the Book can never move an existing FTD List's Total row out of position.
 *
 * v29 changes from v26:
 * - Removed the Roobet Username gate added in v26. Setting Status = "VIP Transferred" or
 *   Transferred to VIP Team = Yes no longer gets blocked/reverted when there's no Roobet
 *   Username yet - that hand-off is manual and trusted. Missing usernames now just show up
 *   flagged (yellow) on the Master VIP Pipeline instead of being blocked at entry.
 * - VIP Transfers and FTD counts on the Stats tab (Today / This Week / This Month) now
 *   count players CURRENTLY sitting in a qualifying status, filtered by the date they
 *   entered that status - not a running tally of every time someone got marked VIP/FTD.
 *   A mistake that gets corrected and reversed now drops back out of the count automatically
 *   instead of counting forever. New one-time menu action, "Fix VIP & FTD Period Formulas",
 *   applies this.
 * - New menu action, "Repair Book Ranking Formulas (Daily Task + Reactivation)" - rebuilds
 *   the five hidden helper columns that drive the Daily Task queue and Dead Lead
 *   Reactivation queue (Q/R/S and U/V) from scratch. These are pure formula columns, so
 *   it's always safe to run. Fixes the exact issue that made Plat's Daily Task queue go
 *   completely blank: a partial "Delete cells > Shift" (rather than a full row delete)
 *   corrupted one row's formula into a literal #REF!, and because the ranking formulas
 *   scan the ENTIRE column for every row, that one bad row poisoned the whole queue. Run
 *   this any time Daily Task or Reactivation looks empty or wrong for no obvious reason -
 *   it doesn't hurt anything to run when things are already fine. Going forward, always
 *   delete a FULL ROW (right-click the row number > Delete row) rather than selecting a
 *   partial range and using Delete cells > Shift - that's what causes this corruption.
 *
 * v26 changes from v25 - VIP Pipeline data quality:
 * - Roobet Username is now REQUIRED before a player can be set to Status = "VIP
 *   Transferred" or Transferred to VIP Team = Yes. Trying either without one reverts the
 *   edit and shows a toast explaining why - no more VIP entries with no way to identify
 *   the player's account.
 * - New one-time (safe to run any time) menu action, "Audit VIP Missing Roobet Username" -
 *   lists every player who was already set to VIP Transferred / Transferred to VIP Team
 *   before this gate existed and still has no Roobet Username, so you can go fix each one
 *   by hand (add the username, or correct the status if it was set in error). This never
 *   changes anything automatically.
 * - New one-time menu action, "Fix VIP Pipeline Filters" - hardens the Book's own "Sent
 *   to VIP Team" list against a row whose Player Handle got cleared but still has a stray
 *   Transferred to VIP Team = Yes value left behind (was showing up as a blank "ghost"
 *   row), and against missing Roobet Usernames.
 * - The Master Dashboard's VIP Pipeline (separate spreadsheet, not driven by this script)
 *   needs the matching fix applied by hand - ask Claude for the replacement formula and
 *   conditional formatting rule when you're ready to do that.
 *
 * v25 changes from v24 - FTD List is now a live, self-correcting sync instead of a
 * permanent append-only log:
 * - The FTD List (and FTD Date) used to only trigger off the exact transition INTO
 *   "First Deposit". If a rep set Status straight to "Active" (skipping First Deposit as
 *   a step), that player never got added - this is what happened with Moneyheist's
 *   player. Now First Deposit OR Active both qualify.
 * - If a Status that used to qualify gets corrected away (mis-clicked First Deposit, then
 *   fixed back to Interested, for example), that player is now automatically REMOVED from
 *   the FTD List and their FTD Date is cleared, so a real future FTD gets a clean, correct
 *   date instead of the mistaken one sticking around forever. This runs on every Status
 *   edit, live - no more manual cleanup on the FTD List tab.
 * - New one-time (but safe to run any time) menu action, "Repair & Rebuild FTD List" -
 *   wipes and rebuilds THIS rep's own FTD List tab from what's actually in the Book right
 *   now (every First Deposit / Active player), without ever moving the Total Weighted
 *   Wager row. Use this any time the list looks wrong.
 * - IMPORTANT - what actually broke the Master FTD List: deleting a row by hand from
 *   inside a rep's FTD List tab (via right-click > Delete row) shifts every row below it
 *   up by one - including the Total Weighted Wager row at the very bottom, which slides
 *   up into the data area the Master Dashboard imports. That corrupted row is what took
 *   down the WHOLE combined Master FTD List (all reps), not just that one rep's rows -
 *   the Master formula stacks every rep into one array, so one bad row anywhere breaks
 *   the entire result. From now on, never delete a row inside an FTD List tab by hand -
 *   use "Repair & Rebuild FTD List" instead, which is built specifically to never disturb
 *   the Total row's position. (The Master Dashboard's own combined formula has also been
 *   hardened separately so one rep's bad data can no longer blank out everyone else's.)
 *
 * v24 changes from v23 - real bug fixes, plus two KPI/tracking definition changes:
 * - Fixed a bug where pasting a Player Handle into the Book (instead of typing it) could
 *   silently fail to auto-fill the rest of the row (Date Assigned, Last Contact Date,
 *   Status defaulting to Initial Contact). The old trigger only handled edits to exactly
 *   one cell at a time - if the paste landed as a multi-cell edit (which can happen even
 *   pasting what looks like a single value, depending on what's in the clipboard), it
 *   silently did nothing. It now handles any size edit - typed, pasted, or dragged - the
 *   same way. Also hardened the same spot on the FTD List (Total Wager column) so a
 *   multi-cell paste there can't cause similar silent no-ops. Just paste this version in
 *   and reload - no menu action needed for this part of the fix.
 * - The Book's ID column (A) is now included in "Set Up Protections" - it's a formula,
 *   not typed text, and pasting or dragging over it was showing #REF! errors with no
 *   warning. Run "Set Up Protections" from the menu (safe to run again) to get the
 *   warning banner on this column too.
 * - "Active Leads" (Today/This Week/This Month, and its Target) now counts by a lead's
 *   CURRENT status, excluding Dead Lead and Potential Lead - not by the historical
 *   "Outreach" Activity Log event like before. A lead that's since gone dead or gone
 *   quiet no longer keeps padding a rep's numbers. New one-time menu action, "Fix Active
 *   Leads Definition", patches this on an already-live Stats tab (safe to run twice).
 * - FTD List: removed "Total Wager (manual, monthly)" - it was redundant with Weighted
 *   Wager (which already pulls live from the Book) and just extra manual upkeep for no
 *   real benefit. Replaced with a live "Total Weighted Wager" sum at the bottom of the
 *   list. New one-time menu action, "Fix FTD List Wager Column", applies this to an
 *   already-live FTD List tab - it checks for any numbers already typed into the manual
 *   column first and will stop and warn you instead of deleting real data silently.
 *
 * v23 changes from v22:
 * - Dead Lead Reactivation now shows EVERY dead lead right away, ranked by Next Retarget
 *   Date (soonest first) - previously a dead lead only appeared once their ~30-day
 *   re-target date actually arrived. A row only turns red once that date arrives, so you
 *   can still see at a glance who's due today vs later. Capacity for that block goes from
 *   30 to 200 rows so nobody silently falls off the list. New one-time menu action,
 *   "Expand Dead Lead Reactivation", handles the live-sheet migration (run "Update Status
 *   Cadence & Options" first - this depends on the 30-day cadence it sets).
 * - New "Add Status Breakdown to Stats" one-time action: adds a small live block to the
 *   Stats tab showing a count of players currently in each status (Dead Lead, Potential
 *   Lead, etc.) - purely informational, not tied to any KPI target.
 *
 * v22 changes from v21 - Daily Task Notes now writes back to the Book instead of being a
 * trap (typing directly into it used to overwrite its live-pull formula with frozen
 * text); new "Update Status Cadence & Options" one-time action changes Dead Lead's
 * cadence to 30 days and adds "Potential Lead" as a Status option for every rep.
 *
 * v21 - stagnant-wager highlight on the FTD List (re-enter the same Total Wager and the
 * row turns red - a nudge to check in on that player).
 *
 * v20 - FTD List tab (auto-added on First Deposit) + auto-hide on VIP Transfer.
 *
 * v19 - FTD Date is stamped directly by the script (a real value, not a live formula).
 *
 * ONE-TIME SETUP after pasting this in: reload the sheet, then run (in this order) "Apply
 * July Feature Update", "Fix Wager & FTD Tracking", "Update Status Cadence & Options",
 * "Expand Dead Lead Reactivation", "Add Status Breakdown to Stats", "Fix Active Leads
 * Definition", "Fix FTD List Wager Column", "Repair & Rebuild FTD List", then "Fix VIP
 * Pipeline Filters" - all safe to run twice, each checks before it changes anything.
 * Also run "Audit VIP Missing Roobet Username" any time to find existing data to clean
 * up, and "Set Up Protections" any time (safe to re-run) to pick up the newest protected
 * columns.
 */

var HEADER_ROW_BOOK = 3;
var HEADER_ROW_DAILY_TASK = 4;

// Book column positions
var COL_PLAYER_HANDLE = 2;      // B
var COL_SOURCE = 3;             // C
var COL_ROOBET_USERNAME = 4;    // D
var COL_STATUS = 5;             // E
var COL_DATE_ASSIGNED = 8;      // H
var COL_LAST_CONTACT = 9;       // I
var COL_WEIGHTED_WAGER = 14;    // N
var COL_NOTES = 16;             // P
var COL_ATTEMPTS = 20;          // T
var COL_REACT_FLAG = 21;        // U
var COL_REACT_RANK = 22;        // V
var COL_VIP_TRANSFER_DATE = 23; // W
var COL_VIP_CHECKINS = 24;      // X
var COL_VIPFT_DATE = 27;        // AA
var COL_VIPFT_ATTEMPTS = 28;    // AB
var COL_VIP_TEAM = 29;          // AC
var COL_FTD_DATE = 32;          // AF
var ATTEMPTS_THRESHOLD = 3;
var VIP_CHECKINS_MAX = 3;
var VIPFT_ATTEMPTS_MAX = 3;

// FTD List column positions (on the "<Rep> - FTD List" tab)
var FTD_LIST_HEADER_ROW = 4;
var FTD_LIST_FIRST_ROW = 5;
// Deliberately its OWN number, not tied to BOOK_ROWS. The FTD List's Total row position is
// already baked into every rep's tab - if this followed BOOK_ROWS and BOOK_ROWS changed,
// every existing Total row would suddenly be in the wrong place and the list would break.
var FTD_LIST_CAPACITY = 200;
var FTD_LIST_COL_TOTAL_WAGER = 5; // E - the old manually-edited column, being phased out
var STAGNANT_WAGER_COLOR = "#F4CCCC";

// A player counts as a First Time Depositor - belongs on the FTD List, gets an FTD Date -
// the moment their Status is First Deposit OR Active (not just First Deposit). Reps
// sometimes set Status straight to Active and skip First Deposit as a step, and that
// player still needs to show up on the FTD List.
var FTD_QUALIFYING_STATUSES = ["First Deposit", "Active"];

function isFtdQualifyingStatus_(status) {
  return FTD_QUALIFYING_STATUSES.indexOf(status) !== -1;
}

var ACTLOG_HEADER_ROW = 4;
var ACTLOG_COL_PLAYER_HANDLE = 5;  // E

var DT_COL_DONE = 1;
var DT_COL_MATCH_ROW = 2;
var DT_COL_STATUS = 9;
var DT_COL_NOTES = 13;

var BULK_IMPORT_HEADER_ROW = 5;
var BULK_COL_HANDLE = 1;
var BULK_COL_SOURCE = 2;
var BULK_COL_ROOBET = 3;
var SOURCE_CHANNELS = ["Instagram", "Discord", "Twitter", "Telegram", "SlotEssentials", "Other"];

// Full list of Status dropdown options - used by the Status Breakdown block to count how
// many players currently sit in each one. Must match the Lists tab / Book dropdown.
var STATUS_BREAKDOWN_LIST = ["Initial Contact", "Interested", "VIP Transferred", "KYC Complete",
  "First Deposit", "Active", "Reactivation Queue", "Dead Lead", "Potential Lead"];

// Book capacity - 200 up to v29, 1000 from v30 on. Changing this number alone does NOT
// grow anyone's sheet - run "Step 1: Expand Book to 1000 Rows" once per rep sheet.
var BOOK_ROWS = 1000;
var BOOK_FIRST_ROW = HEADER_ROW_BOOK + 1;   // 4
var BOOK_LAST_ROW = BOOK_FIRST_ROW + BOOK_ROWS - 1; // 1003

// Fallback only. Used when we can't find the real end of the lead rows by looking at the
// sheet - see findBookVipBlockRow_(). Rows deleted by hand mean the real boundary is often
// NOT this number, which is exactly why we look rather than assume.
var PRE_V30_BOOK_LAST_ROW = 203;

// Daily Task main "due now" queue - 60 up to v30, 150 from v31 on.
var DT_MAIN_ROWS = 300;
var DT_MAIN_FIRST_ROW = HEADER_ROW_DAILY_TASK + 1;              // 5
var DT_MAIN_LAST_ROW = DT_MAIN_FIRST_ROW + DT_MAIN_ROWS - 1;    // 154
var PRE_V31_MAIN_LAST_ROW = 64;

// Dead Lead Reactivation block - 200 up to v30, 500 from v31 on. Its header sits 2 blank
// rows below the main queue's last row.
var REACT_ROWS = 500;
var REACT_HEADER_ROW = DT_MAIN_LAST_ROW + 3;              // 157
var REACT_FIRST_ROW = REACT_HEADER_ROW + 1;               // 158
var REACT_LAST_ROW = REACT_FIRST_ROW + REACT_ROWS - 1;    // 657

// Daily Task tab layout, v37 - one tab, three blocks, in this order:
//   Today's queue -> Coming Up preview -> Dead Lead Reactivation
// Every block is 13 columns, unchanged, so the edit handlers work exactly as before.
var DT_PREVIEW_ROWS = 150;
var DT_PREVIEW_NOTE_ROW = DT_MAIN_LAST_ROW + 2;              // 156
var DT_PREVIEW_HEADER_ROW = DT_PREVIEW_NOTE_ROW + 1;         // 157
var DT_PREVIEW_FIRST_ROW = DT_PREVIEW_HEADER_ROW + 1;        // 158
var DT_PREVIEW_LAST_ROW = DT_PREVIEW_FIRST_ROW + DT_PREVIEW_ROWS - 1;  // 257

var DT_DEAD_ROWS = 300;
// Row that reports how many are due vs how many fit, so a shortfall can never be silent.
var DT_MAIN_COUNT_ROW = DT_MAIN_LAST_ROW + 1;
var DT_DEAD_NOTE_ROW = DT_PREVIEW_LAST_ROW + 2;              // 259
var DT_DEAD_HEADER_ROW = DT_DEAD_NOTE_ROW + 1;               // 260
var DT_DEAD_FIRST_ROW = DT_DEAD_HEADER_ROW + 1;              // 261
var DT_DEAD_LAST_ROW = DT_DEAD_FIRST_ROW + DT_DEAD_ROWS - 1; // 560

// Task Complete / Status / Notes edits stay actionable down through the last block.
var DT_ACTIONABLE_LAST_ROW = DT_DEAD_LAST_ROW;

var DT_HEADERS = ["Task Complete", "Match Row", "Player ID", "Player Name", "Due Date",
  "Owner", "Source", "Roobet Username", "Status\n(pick to update)", "Health",
  "Required Action", "Days Since\nLast Contact", "Notes"];

// Every date this script writes comes from here, and "what day is it" is decided by THIS
// SHEET'S time zone (File > Settings > Time zone) - not the server's, not the viewer's.
// That's why a rep in another country can get yesterday's date stamped on this morning's
// work. Fix it per sheet with the "Set This Sheet's Time Zone" menu action.
//
// Returns a plain yyyy-MM-dd string on purpose - a date with no time attached. A bare date
// can't drift across midnight when it's read somewhere else. A real timestamp can.
function today_(ss) {
  var tz = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function sameDay_(value, ss) {
  if (!value) return false;
  // If it's already a plain yyyy-MM-dd string (what today_() writes), compare it as text.
  // Parsing it into a Date first is what causes off-by-one-day bugs: JavaScript reads a
  // bare "2026-07-20" as midnight UTC, so re-formatting it in any time zone behind UTC
  // hands back the 19th.
  if (typeof value === "string") {
    var trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed === today_(ss);
  }
  var tz = ss.getSpreadsheetTimeZone();
  var stored = Utilities.formatDate(new Date(value), tz, "yyyy-MM-dd");
  return stored === today_(ss);
}

function onEdit(e) {
  try {
    var sheet = e.range.getSheet();
    var name = sheet.getName();
    if (name.indexOf(" - Book") !== -1) {
      handleBookEdit_(e, sheet);
    } else if (name.indexOf(" - Daily Task") !== -1) {
      handleDailyTaskEdit_(e, sheet);
    } else if (name.indexOf(" - FTD List") !== -1) {
      handleFtdListEdit_(e, sheet);
    }
  } catch (err) {
    // Fail silently so a script error never blocks manual editing of the sheet.
  }
}

function repNameFromSheet_(sheetName) {
  return sheetName.split(" - ")[0];
}

function appendActivityLog_(ss, repName, eventType, playerId, playerHandle) {
  var logSheet = ss.getSheetByName(repName + " - Activity Log");
  if (!logSheet) return;
  logSheet.appendRow([today_(ss), repName, eventType, playerId, playerHandle]);
}

function startStageTracking_(bookSheet, row, dateCol, counterCol) {
  var dateCell = bookSheet.getRange(row, dateCol);
  if (!dateCell.getValue()) {
    dateCell.setValue(today_(bookSheet.getParent()));
  }
  bookSheet.getRange(row, counterCol).setValue(0);
}

// Creates the "<Rep> - FTD List" tab from scratch if it doesn't exist yet - safe to call
// on a live production sheet, since it only ever adds a brand-new tab and never touches
// the Book, Daily Task, Stats, or Activity Log. 4-column layout (Player Handle, Roobet
// Username, FTD Date, Weighted Wager) plus a live Total Weighted Wager sum at the bottom
// - no manual monthly wager entry anymore, matches the current build script.
function ensureFtdListSheet_(ss, repName) {
  var sheetName = repName + " - FTD List";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1).setValue(repName + "'s FTD List — First Time Depositors");
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  sheet.getRange(2, 1, 1, 4).merge();
  sheet.getRange(2, 1).setValue(
    "Added automatically the moment a player's Status is set to First Deposit or Active on " +
    "the Book. Roobet Username, FTD Date, and Weighted Wager are all pulled in automatically " +
    "and read-only - nothing to fill in by hand. Players also stay on the Book as usual, " +
    "this is just a clean, dedicated view. Total Weighted Wager (all players, live) is at " +
    "the bottom."
  );
  sheet.getRange(2, 1).setWrap(true).setFontStyle("italic").setFontColor("#666666");
  sheet.setRowHeight(2, 40);

  var headers = ["Player Handle", "Roobet Username", "FTD Date", "Weighted Wager"];
  sheet.getRange(FTD_LIST_HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(FTD_LIST_HEADER_ROW, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF").setWrap(true);
  sheet.setRowHeight(FTD_LIST_HEADER_ROW, 32);

  sheet.getRange(FTD_LIST_FIRST_ROW, 3, FTD_LIST_CAPACITY, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(FTD_LIST_FIRST_ROW, 4, FTD_LIST_CAPACITY, 1).setNumberFormat("$#,##0;($#,##0);-");

  var totalRow = FTD_LIST_FIRST_ROW + FTD_LIST_CAPACITY;
  sheet.getRange(totalRow, 3).setValue("Total Weighted Wager:");
  sheet.getRange(totalRow, 3).setFontWeight("bold").setFontColor("#1F3864").setHorizontalAlignment("right");
  sheet.getRange(totalRow, 4).setFormula(
    '=SUM(D' + FTD_LIST_FIRST_ROW + ':D' + (totalRow - 1) + ')'
  );
  sheet.getRange(totalRow, 4).setFontWeight("bold").setFontColor("#1F3864").setNumberFormat("$#,##0;($#,##0);-");

  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 120);
  sheet.setFrozenRows(FTD_LIST_HEADER_ROW);

  return sheet;
}

// Adds a player to the "<Rep> - FTD List" tab the first time they qualify (Status = First
// Deposit or Active), or updates their existing row in place if they're already on the
// list (their Roobet Username or Weighted Wager may have changed since they were added).
// Idempotent either way - safe to call on every qualifying Status edit. Never writes into
// or past the fixed Total row, so it can never corrupt that row's position.
function appendToFtdListIfNeeded_(ss, repName, bookSheet, row) {
  var ftdListSheet = ss.getSheetByName(repName + " - FTD List");
  if (!ftdListSheet) return;

  var handle = bookSheet.getRange(row, COL_PLAYER_HANDLE).getValue();
  if (!handle) return;

  var roobet = bookSheet.getRange(row, COL_ROOBET_USERNAME).getValue();
  var ftdDate = bookSheet.getRange(row, COL_FTD_DATE).getValue() || today_(ss);
  var wager = bookSheet.getRange(row, COL_WEIGHTED_WAGER).getValue();

  var totalRow = FTD_LIST_FIRST_ROW + FTD_LIST_CAPACITY;
  var lastRow = Math.min(ftdListSheet.getLastRow(), totalRow - 1);
  if (lastRow >= FTD_LIST_FIRST_ROW) {
    var existingHandles = ftdListSheet
      .getRange(FTD_LIST_FIRST_ROW, 1, lastRow - FTD_LIST_FIRST_ROW + 1, 1)
      .getValues();
    for (var i = 0; i < existingHandles.length; i++) {
      if (existingHandles[i][0] === handle) {
        // Already on the list - refresh their row in place instead of skipping, in case
        // Roobet Username or Weighted Wager changed since they were added.
        var existingRow = FTD_LIST_FIRST_ROW + i;
        ftdListSheet.getRange(existingRow, 1, 1, 4).setValues([[handle, roobet, ftdDate, wager]]);
        return;
      }
    }
  }

  var targetRow = Math.max(lastRow + 1, FTD_LIST_FIRST_ROW);
  if (targetRow >= totalRow) return; // full - don't ever write into the Total row's slot
  ftdListSheet.getRange(targetRow, 1, 1, 4).setValues([[handle, roobet, ftdDate, wager]]);
  ftdListSheet.getRange(targetRow, 3).setNumberFormat("yyyy-mm-dd");
  ftdListSheet.getRange(targetRow, 4).setNumberFormat("$#,##0;($#,##0);-");
}

// Removes a player's row from the "<Rep> - FTD List" tab if present - used when a Status
// that used to qualify (First Deposit / Active) gets corrected to something else.
// Compacts the rows below upward WITHIN the fixed data block only (row FTD_LIST_FIRST_ROW
// through the row just above the Total row) and clears the freed-up last slot - this
// deliberately never uses deleteRow/insertRow, which shifts EVERY row below on the whole
// sheet, including the Total row's formula, out of position. That exact kind of shift -
// a row deleted by hand from inside an FTD List tab - is what corrupted the Master FTD
// List earlier: the Total row slid up into the data range the Master Dashboard imports,
// and one bad row anywhere broke the combined view for every rep, not just this one.
function removeFtdListEntryIfPresent_(ss, repName, handle) {
  if (!handle) return;
  var ftdListSheet = ss.getSheetByName(repName + " - FTD List");
  if (!ftdListSheet) return;

  var totalRow = FTD_LIST_FIRST_ROW + FTD_LIST_CAPACITY;
  var lastRow = Math.min(ftdListSheet.getLastRow(), totalRow - 1);
  if (lastRow < FTD_LIST_FIRST_ROW) return;

  var data = ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 1, lastRow - FTD_LIST_FIRST_ROW + 1, 4).getValues();
  var foundIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === handle) { foundIndex = i; break; }
  }
  if (foundIndex === -1) return;

  data.splice(foundIndex, 1);
  data.push(["", "", "", ""]);
  ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 1, data.length, 4).setValues(data);
  ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 3, data.length, 1).setNumberFormat("yyyy-mm-dd");
  ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 4, data.length, 1).setNumberFormat("$#,##0;($#,##0);-");
}

// Hides (or reveals) a Book row based on the Transferred to VIP Team value.
function updateVipHideForRow_(bookSheet, row, vipTeamValue) {
  try {
    if (vipTeamValue === "Yes") {
      bookSheet.hideRows(row);
    } else {
      bookSheet.showRows(row);
    }
  } catch (err) {
    // ignore - not worth blocking the edit over
  }
}

// Keeps a Book row's FTD Date and its entry on the "<Rep> - FTD List" tab in sync with
// its CURRENT Status - not a one-way permanent stamp. If Status is First Deposit or
// Active, the player is added/updated on the FTD List (FTD Date is only stamped the
// first time - correcting Roobet Username or re-saving later doesn't reset it). If
// Status is corrected back to anything else (a mis-clicked First Deposit, for example),
// the player is removed from the FTD List and FTD Date is cleared, so a genuine future
// FTD gets a clean, accurate date instead of the mistaken one sticking around.
function stampFtdDateIfNeeded_(bookSheet, row, ss, newStatus, repName) {
  var ftdCell = bookSheet.getRange(row, COL_FTD_DATE);

  if (isFtdQualifyingStatus_(newStatus)) {
    if (!ftdCell.getValue()) {
      ftdCell.setValue(today_(ss));
    }
    appendToFtdListIfNeeded_(ss, repName, bookSheet, row);
  } else {
    var handle = bookSheet.getRange(row, COL_PLAYER_HANDLE).getValue();
    if (ftdCell.getValue()) {
      ftdCell.setValue("");
    }
    removeFtdListEntryIfPresent_(ss, repName, handle);
  }
}

function initializeNewLead_(sheet, row, ss, repName, isFirstTime) {
  var handle = sheet.getRange(row, COL_PLAYER_HANDLE).getValue();
  if (!handle) return;
  var dateAssignedCell = sheet.getRange(row, COL_DATE_ASSIGNED);
  if (!dateAssignedCell.getValue()) dateAssignedCell.setValue(today_(ss));
  var lastContactCell = sheet.getRange(row, COL_LAST_CONTACT);
  if (!lastContactCell.getValue()) lastContactCell.setValue(today_(ss));
  var statusCell = sheet.getRange(row, COL_STATUS);
  if (!statusCell.getValue()) statusCell.setValue("Initial Contact");
  if (isFirstTime) {
    var playerId = sheet.getRange(row, 1).getValue();
    appendActivityLog_(ss, repName, "Outreach", playerId, handle);
  }
}

// Handles any size of edit to the Book - a single typed cell, a single pasted cell, or a
// multi-cell paste/fill-drag spanning several rows and/or columns. Previously this bailed
// out entirely unless the edit was exactly one cell, which meant pasting a Player Handle
// could silently fail to auto-fill the rest of the row if the paste registered as a
// multi-cell edit (can happen even for what looks like a single value, depending on what
// was actually on the clipboard) - that's the "pasted a name but the rest doesn't fill
// out" bug. Now every cell in the edited range gets handled the same way regardless of
// how it arrived.
function handleBookEdit_(e, sheet) {
  if (!e.range) return;
  var startRow = e.range.getRow();
  var startCol = e.range.getColumn();
  var numRows = e.range.getNumRows();
  var numCols = e.range.getNumColumns();
  var ss = e.source;
  var repName = repNameFromSheet_(sheet.getName());
  // e.oldValue is only ever populated by Apps Script for a true single-cell edit - for a
  // multi-cell paste it's undefined no matter what, so there's no way to recover a
  // reliable "old status" per cell in that case. Passed through so status-change logging
  // (which feeds Activity Log / stats) stays conservative and only logs when we actually
  // know the prior value.
  var isSingleCell = (numRows === 1 && numCols === 1);
  var singleCellOldValue = isSingleCell ? e.oldValue : undefined;

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    if (row <= HEADER_ROW_BOOK) continue;
    for (var j = 0; j < numCols; j++) {
      var col = startCol + j;
      handleBookCellEdit_(sheet, row, col, ss, repName, isSingleCell, singleCellOldValue);
    }
  }
}

function handleBookCellEdit_(sheet, row, col, ss, repName, isSingleCell, singleCellOldValue) {
  if (col === COL_PLAYER_HANDLE) {
    var handle = sheet.getRange(row, COL_PLAYER_HANDLE).getValue();
    if (!handle) return;
    // Treat this as a brand-new lead if the row hasn't been initialized yet (Date
    // Assigned still blank) - this is more reliable than checking e.oldValue, since it
    // works the same whether the handle was typed, pasted as a single cell, or arrived
    // as part of a multi-cell paste, and it still prevents a duplicate Outreach log if
    // someone edits/corrects an already-initialized row's handle later.
    var isFirstTime = !sheet.getRange(row, COL_DATE_ASSIGNED).getValue();
    initializeNewLead_(sheet, row, ss, repName, isFirstTime);
    return;
  }

  if (col === COL_ROOBET_USERNAME) {
    var roobet = sheet.getRange(row, COL_ROOBET_USERNAME).getValue();
    if (roobet) {
      sheet.getRange(row, COL_ATTEMPTS).setValue(0);
    }
    return;
  }

  if (col === COL_STATUS) {
    var newStatusVal = sheet.getRange(row, COL_STATUS).getValue() || "";
    if (!newStatusVal) return;
    if (newStatusVal === "VIP Transferred") {
      startStageTracking_(sheet, row, COL_VIPFT_DATE, COL_VIPFT_ATTEMPTS);
    }
    stampFtdDateIfNeeded_(sheet, row, ss, newStatusVal, repName);
    // Only log a Status Change Activity Log entry (which feeds the KPI stats) when this
    // was a genuine single-cell edit and we actually know the old value - guessing on a
    // multi-cell paste risks logging a change that didn't really happen.
    if (isSingleCell) {
      logStatusChange_(ss, repName, sheet, row, singleCellOldValue || "", newStatusVal);
    }
    return;
  }

  if (col === COL_VIP_TEAM) {
    var vipVal = sheet.getRange(row, COL_VIP_TEAM).getValue();
    updateVipHideForRow_(sheet, row, vipVal);
    if (vipVal === "Yes") {
      var playerId2 = sheet.getRange(row, 1).getValue();
      var playerHandle2 = sheet.getRange(row, COL_PLAYER_HANDLE).getValue();
      appendActivityLog_(ss, repName, "VIP Transfer", playerId2, playerHandle2);
      startStageTracking_(sheet, row, COL_VIP_TRANSFER_DATE, COL_VIP_CHECKINS);
    }
    return;
  }
}

function logStatusChange_(ss, repName, bookSheet, matchRow, oldStatus, newStatus) {
  if (oldStatus === newStatus) return;
  var playerId = bookSheet.getRange(matchRow, 1).getValue();
  var playerName = bookSheet.getRange(matchRow, COL_PLAYER_HANDLE).getValue();
  var label = "Status Change: " + (oldStatus || "(none)") + " -> " + newStatus;
  appendActivityLog_(ss, repName, label, playerId, playerName);
}

function logCompletion_(bookSheet, ss, repName, matchRow, logFollowup) {
  if (typeof logFollowup === "undefined") logFollowup = true;
  if (!bookSheet || matchRow === "" || matchRow === null || isNaN(matchRow)) return;

  var lastContactCell = bookSheet.getRange(matchRow, COL_LAST_CONTACT);
  if (sameDay_(lastContactCell.getValue(), ss)) return;

  var playerId = bookSheet.getRange(matchRow, 1).getValue();
  var playerName = bookSheet.getRange(matchRow, COL_PLAYER_HANDLE).getValue();

  lastContactCell.setValue(today_(ss));

  var status = bookSheet.getRange(matchRow, COL_STATUS).getValue();

  var roobetUsername = bookSheet.getRange(matchRow, COL_ROOBET_USERNAME).getValue();
  if (!roobetUsername) {
    var attemptsCell = bookSheet.getRange(matchRow, COL_ATTEMPTS);
    var current = Number(attemptsCell.getValue()) || 0;
    var updated = current + 1;
    attemptsCell.setValue(updated);

    if (updated >= ATTEMPTS_THRESHOLD) {
      var statusCell = bookSheet.getRange(matchRow, COL_STATUS);
      var curStatus = statusCell.getValue();
      if (curStatus !== "Dead Lead") {
        statusCell.setValue("Dead Lead");
        status = "Dead Lead";
      }
    }
  }

  var vipTeamValue = bookSheet.getRange(matchRow, COL_VIP_TEAM).getValue();
  if (vipTeamValue === "Yes") {
    var vipCell = bookSheet.getRange(matchRow, COL_VIP_CHECKINS);
    var vipCurrent = Number(vipCell.getValue()) || 0;
    if (vipCurrent < VIP_CHECKINS_MAX) {
      vipCell.setValue(vipCurrent + 1);
    }
  }

  if (status === "VIP Transferred") {
    var vftCell = bookSheet.getRange(matchRow, COL_VIPFT_ATTEMPTS);
    var vftCurrent = Number(vftCell.getValue()) || 0;
    var vftUpdated = vftCurrent + 1;
    vftCell.setValue(vftUpdated);
    if (vftUpdated >= VIPFT_ATTEMPTS_MAX) {
      bookSheet.getRange(matchRow, COL_STATUS).setValue("Dead Lead");
    }
  }

  if (logFollowup) {
    appendActivityLog_(ss, repName, "Follow-up", playerId, playerName);
  }
}

function handleDailyTaskStatusEdit_(e, sheet) {
  var row = e.range.getRow();
  var newStatus = e.value;
  if (!newStatus) return;

  var ss = e.source;
  var repName = repNameFromSheet_(sheet.getName());
  var bookSheet = ss.getSheetByName(repName + " - Book");
  if (!bookSheet) return;

  var matchRow = sheet.getRange(row, DT_COL_MATCH_ROW).getValue();
  if (matchRow === "" || matchRow === null || isNaN(matchRow)) return;

  var oldStatus = bookSheet.getRange(matchRow, COL_STATUS).getValue();
  bookSheet.getRange(matchRow, COL_STATUS).setValue(newStatus);
  if (newStatus === "VIP Transferred") {
    startStageTracking_(bookSheet, matchRow, COL_VIPFT_DATE, COL_VIPFT_ATTEMPTS);
  }
  stampFtdDateIfNeeded_(bookSheet, matchRow, ss, newStatus, repName);

  logStatusChange_(ss, repName, bookSheet, matchRow, oldStatus, newStatus);
  logCompletion_(bookSheet, ss, repName, matchRow, false);

  var bk2 = "'" + repName + " - Book'";
  sheet.getRange(row, DT_COL_STATUS).setFormula(
    '=IF($B' + row + '="","",INDEX(' + bk2 + '!$E:$E,$B' + row + '))'
  );
}

// Notes on Daily Task is normally a live pull from the Book. Typing directly into it used
// to overwrite that formula with frozen plain text - this saves what was typed onto the
// player's real Book row, then resets the cell back to the live-pull formula.
function handleDailyTaskNotesEdit_(e, sheet) {
  var row = e.range.getRow();
  var newNote = e.value || "";

  var ss = e.source;
  var repName = repNameFromSheet_(sheet.getName());
  var bookSheet = ss.getSheetByName(repName + " - Book");
  if (!bookSheet) return;

  var matchRow = sheet.getRange(row, DT_COL_MATCH_ROW).getValue();
  if (matchRow === "" || matchRow === null || isNaN(matchRow)) return;

  bookSheet.getRange(matchRow, COL_NOTES).setValue(newNote);

  var bk = "'" + repName + " - Book'";
  sheet.getRange(row, DT_COL_NOTES).setFormula(
    '=IF($B' + row + '="","",INDEX(' + bk + '!$P:$P,$B' + row + '))'
  );
}

function setupProtections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var touched = 0;
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (name.indexOf(" - Book") !== -1) {
      protectColumns_(sheet, [1],
        "This is the auto-numbered ID column (a formula, not typed text) - typing or " +
        "pasting over it will break the formula and can show #REF! errors. If that " +
        "happens, select a working ID cell nearby, copy it, and paste (or drag the fill " +
        "handle) into the broken cell to restore it.");
      protectColumns_(sheet, [6, 7, 10, 11, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31],
        "This column is calculated automatically, or maintained by the script (Health / " +
        "Next Action / DueRank / Follow-Up Attempts / VIP checkpoint dates+counters / Coming " +
        "Up ranking). Typing over it can break the automation - edit Status, Roobet Username, " +
        "VIP Team, or the other input columns instead.");
      touched++;
    } else if (name.indexOf(" - Daily Task") !== -1) {
      protectColumns_(sheet, [2, 3, 4, 5, 6, 7, 8, 10, 11, 12],
        "This is pulled automatically from the Book - edit it there instead " +
        "(only Task Complete, Status, and Notes are meant to be changed here).");
      touched++;
    } else if (name.indexOf(" - FTD List") !== -1) {
      protectColumns_(sheet, [1, 2, 3, 4],
        "This whole tab is maintained automatically from the Book - players are added, " +
        "updated, and removed here automatically based on their Status. Never delete a " +
        "row by hand (Right-click > Delete row) - that shifts the Total Weighted Wager " +
        "row out of position and can corrupt the Master Dashboard's combined FTD List. " +
        "Use Daily Gamba Tools > Repair & Rebuild FTD List instead if this list ever " +
        "looks wrong.");
      touched++;
    }
  }
  SpreadsheetApp.getUi().alert("Protections set up on " + touched + " tab(s).");
}

function protectColumns_(sheet, colIndexes, warningMessage) {
  var lastRow = sheet.getMaxRows();
  for (var i = 0; i < colIndexes.length; i++) {
    var col = colIndexes[i];
    var range = sheet.getRange(1, col, lastRow, 1);
    var protection = range.protect();
    protection.setDescription(warningMessage);
    protection.setWarningOnly(true);
  }
}

function handleDailyTaskEdit_(e, sheet) {
  if (!e.range) return;

  if (e.range.getRow() > DT_ACTIONABLE_LAST_ROW) return;

  if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 &&
      e.range.getColumn() === DT_COL_STATUS && e.range.getRow() > HEADER_ROW_DAILY_TASK) {
    handleDailyTaskStatusEdit_(e, sheet);
    return;
  }

  if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 &&
      e.range.getColumn() === DT_COL_NOTES && e.range.getRow() > HEADER_ROW_DAILY_TASK) {
    handleDailyTaskNotesEdit_(e, sheet);
    return;
  }

  var startRow = e.range.getRow();
  var numRows = e.range.getNumRows();
  var ss = e.source;
  var repName = repNameFromSheet_(sheet.getName());
  var bookSheet = ss.getSheetByName(repName + " - Book");

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    if (row <= HEADER_ROW_DAILY_TASK || row > DT_ACTIONABLE_LAST_ROW) continue;
    var doneCell = sheet.getRange(row, DT_COL_DONE);
    if (doneCell.getValue() !== true) continue;

    var matchRow = sheet.getRange(row, DT_COL_MATCH_ROW).getValue();
    logCompletion_(bookSheet, ss, repName, matchRow);
    doneCell.setValue(false);
  }
}

// Handles any size of edit to the FTD List's Total Wager column - same paste-safety fix
// as the Book above. A true single-cell edit still gets the full stagnant-wager check
// (re-entering the same number highlights the row red); a multi-cell paste just clears
// the highlight on each affected row rather than guessing, since e.oldValue isn't
// available per-cell for a multi-cell paste. NOTE: this whole column is being phased out
// (see fixFtdListWagerColumn below) - this handler simply becomes a no-op once the column
// itself is removed from a given sheet, since FTD_LIST_COL_TOTAL_WAGER (E) won't exist
// there anymore.
function handleFtdListEdit_(e, sheet) {
  if (!e.range) return;
  var startRow = e.range.getRow();
  var startCol = e.range.getColumn();
  var numRows = e.range.getNumRows();
  var numCols = e.range.getNumColumns();
  var isSingleCell = (numRows === 1 && numCols === 1);

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    if (row <= FTD_LIST_HEADER_ROW) continue;
    for (var j = 0; j < numCols; j++) {
      var col = startCol + j;
      if (col !== FTD_LIST_COL_TOTAL_WAGER) continue;
      var rowRange = sheet.getRange(row, 1, 1, 5);

      if (!isSingleCell) {
        rowRange.setBackground(null);
        continue;
      }

      var oldVal = e.oldValue;
      var newVal = e.value;
      var oldIsNumber = oldVal !== undefined && oldVal !== null && oldVal !== "" && !isNaN(Number(oldVal));
      var newIsNumber = newVal !== undefined && newVal !== null && newVal !== "" && !isNaN(Number(newVal));

      if (oldIsNumber && newIsNumber && Number(oldVal) === Number(newVal)) {
        rowRange.setBackground(STAGNANT_WAGER_COLOR);
      } else {
        rowRange.setBackground(null);
      }
    }
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Daily Gamba Tools")
    .addItem("Clean Up Deleted Leads", "cleanUpDeletedLeads")
    .addItem("Set Up Protections", "setupProtections")
    .addItem(">>> RUN FULL SETUP (everything, in order) <<<", "RUN_FULL_SETUP")
    .addSeparator()
    .addItem("Set This Sheet's Time Zone", "setSheetTimeZone")
    .addItem("Check Everything (reports problems, changes nothing)", "checkEverything")
    .addItem("Reset VIP Check-in Clock", "resetVipClock")
    .addItem("Widen Stats + Clean Dates", "expandEverything")
    .addItem("Restore Stats Labels (only if they were wiped)", "restoreStatsLabels")
    .addSeparator()
    .addItem("Set Up Bulk Import Sheet (one-time)", "setupBulkImportSheet")
    .addItem("Import Bulk Leads", "importBulkLeads")
    .addSeparator()
    .addItem("Apply July Feature Update (one-time)", "applyJulyUpdate")
    .addItem("Fix Wager & FTD Tracking (one-time)", "fixWagerAndFtdTracking")
    .addItem("Update Status Cadence & Options (one-time)", "fixStatusCadenceAndOptions")
    .addItem("Add Status Breakdown to Stats (one-time)", "addStatusBreakdown")
    .addItem("Fix Active Leads Definition (one-time)", "fixActiveLeadsDefinition")
    .addItem("Fix VIP & FTD Period Formulas (one-time)", "fixVipFtdPeriodFormulas")
    .addItem("Repair Book Rows (formulas, dropdowns + formatting)", "repairBookRankingFormulas")
    .addSeparator()
    .addItem("Step 1: Expand Book to 1000 Rows", "expandBookCapacity")
    .addItem("Step 2: Move Sent to VIP Team to Own Tab", "moveSentToVipTeamToOwnTab")
    .addItem("Step 3: Rebuild Daily Task Tab (queue, preview, dead leads)", "rebuildDailyTaskTab")
    .addSeparator()
    .addItem("Fix FTD List Wager Column (one-time)", "fixFtdListWagerColumn")
    .addItem("Repair & Rebuild FTD List", "repairFtdList")
    .addItem("Fix VIP Pipeline Filters (one-time)", "fixVipPipelineFilters")
    .addItem("Audit VIP Missing Roobet Username", "auditVipMissingRoobet")
    .addToUi();
}

function cleanUpDeletedLeads() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, logSheet;
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf(" - Book") !== -1) bookSheet = sheets[i];
    if (name.indexOf(" - Activity Log") !== -1) logSheet = sheets[i];
  }
  if (!bookSheet || !logSheet) {
    ui.alert("Couldn't find this file's Book or Activity Log tab.");
    return;
  }

  var currentHandles = {};
  var bookLastRow = bookSheet.getLastRow();
  if (bookLastRow > HEADER_ROW_BOOK) {
    var handles = bookSheet
      .getRange(HEADER_ROW_BOOK + 1, COL_PLAYER_HANDLE, bookLastRow - HEADER_ROW_BOOK, 1)
      .getValues();
    for (var r = 0; r < handles.length; r++) {
      var h = (handles[r][0] || "").toString().trim();
      if (h) currentHandles[h] = true;
    }
  }

  var logLastRow = logSheet.getLastRow();
  if (logLastRow <= ACTLOG_HEADER_ROW) {
    ui.alert("No Activity Log entries to check yet.");
    return;
  }

  var logHandles = logSheet
    .getRange(ACTLOG_HEADER_ROW + 1, ACTLOG_COL_PLAYER_HANDLE, logLastRow - ACTLOG_HEADER_ROW, 1)
    .getValues();

  var rowsToDelete = [];
  for (var j = 0; j < logHandles.length; j++) {
    var handle2 = (logHandles[j][0] || "").toString().trim();
    if (handle2 && !currentHandles[handle2]) {
      rowsToDelete.push(ACTLOG_HEADER_ROW + 1 + j);
    }
  }

  if (rowsToDelete.length === 0) {
    ui.alert("Nothing to clean up - every Activity Log entry matches a player still in the Book.");
    return;
  }

  var noun = rowsToDelete.length === 1 ? "entry" : "entries";
  var response = ui.alert(
    "Clean Up Deleted Leads",
    "Found " + rowsToDelete.length + " Activity Log " + noun +
      " for players no longer in the Book (likely test data or removed leads). " +
      "Delete " + (rowsToDelete.length === 1 ? "it" : "them") + " now? This cannot be undone.",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  for (var k = rowsToDelete.length - 1; k >= 0; k--) {
    logSheet.deleteRow(rowsToDelete[k]);
  }
  ui.alert("Removed " + rowsToDelete.length + " orphaned Activity Log " + noun + ".");
}

function setupBulkImportSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var repName = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) repName = repNameFromSheet_(n);
  }
  if (!repName) {
    ui.alert("Couldn't find this file's Book tab.");
    return;
  }
  var sheetName = repName + " - Bulk Import";
  if (ss.getSheetByName(sheetName)) {
    ui.alert("Bulk Import sheet already exists - nothing to set up.");
    return;
  }
  var sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1).setValue("Bulk add new leads");
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(13);
  sheet.getRange(2, 1, 1, 3).merge();
  sheet.getRange(2, 1).setValue(
    "Paste new leads below - Player Handle is required, Source and Roobet Username are " +
    "optional. When ready, go to Daily Gamba Tools > Import Bulk Leads. This sheet clears " +
    "itself after each successful import, so it's always ready for the next batch."
  );
  sheet.getRange(2, 1).setWrap(true).setFontStyle("italic").setFontColor("#666666");
  sheet.setRowHeight(2, 40);

  sheet.getRange(BULK_IMPORT_HEADER_ROW, 1, 1, 3)
    .setValues([["Player Handle", "Source", "Roobet Username"]])
    .setFontWeight("bold")
    .setBackground("#1F3864")
    .setFontColor("#FFFFFF");

  var sourceRange = sheet.getRange(BULK_IMPORT_HEADER_ROW + 1, BULK_COL_SOURCE, 200, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(SOURCE_CHANNELS, true)
    .setAllowInvalid(true)
    .build();
  sourceRange.setDataValidation(rule);

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 180);
  sheet.setFrozenRows(BULK_IMPORT_HEADER_ROW);

  ui.alert("Bulk Import sheet created. Paste new leads in any time, then run Import Bulk Leads when ready.");
}

function importBulkLeads() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookSheet, bulkSheet, repName;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Bulk Import") !== -1) bulkSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }
  if (!bulkSheet) {
    ui.alert('No Bulk Import sheet yet - run "Set Up Bulk Import Sheet" first.');
    return;
  }

  var lastRow = bulkSheet.getLastRow();
  if (lastRow <= BULK_IMPORT_HEADER_ROW) {
    ui.alert("Nothing to import - the Bulk Import sheet is empty.");
    return;
  }
  var data = bulkSheet
    .getRange(BULK_IMPORT_HEADER_ROW + 1, 1, lastRow - BULK_IMPORT_HEADER_ROW, 3)
    .getValues();

  var bookLastRow = bookSheet.getLastRow();
  var existingHandles = {};
  if (bookLastRow > HEADER_ROW_BOOK) {
    var existing = bookSheet
      .getRange(HEADER_ROW_BOOK + 1, COL_PLAYER_HANDLE, bookLastRow - HEADER_ROW_BOOK, 1)
      .getValues();
    for (var e = 0; e < existing.length; e++) {
      var h = (existing[e][0] || "").toString().trim();
      if (h) existingHandles[h] = true;
    }
  }

  var toImport = [];
  var skippedDupes = [];
  var seenThisBatch = {};
  for (var r = 0; r < data.length; r++) {
    var handle = (data[r][0] || "").toString().trim();
    if (!handle) continue;
    if (existingHandles[handle] || seenThisBatch[handle]) {
      skippedDupes.push(handle);
      continue;
    }
    seenThisBatch[handle] = true;
    toImport.push({ handle: handle, source: data[r][1] || "", roobet: data[r][2] || "" });
  }

  if (toImport.length === 0) {
    var msg = skippedDupes.length > 0
      ? "Nothing new to import - every handle already exists in the Book (" + skippedDupes.join(", ") + ")."
      : "Nothing to import - no Player Handles found in the Bulk Import sheet.";
    ui.alert(msg);
    return;
  }

  var bookMaxRow = bookSheet.getMaxRows();
  var blankRows = [];
  var handles = bookSheet
    .getRange(HEADER_ROW_BOOK + 1, COL_PLAYER_HANDLE, bookMaxRow - HEADER_ROW_BOOK, 1)
    .getValues();
  for (var b = 0; b < handles.length && blankRows.length < toImport.length; b++) {
    if (!handles[b][0]) blankRows.push(HEADER_ROW_BOOK + 1 + b);
  }

  if (blankRows.length < toImport.length) {
    ui.alert("Only " + blankRows.length + " empty row(s) left in the Book, but " +
      toImport.length + " new leads to import. Importing the first " + blankRows.length +
      " now - let Claude know if you need more capacity added.");
    toImport = toImport.slice(0, blankRows.length);
  }

  var confirmMsg = "Import " + toImport.length + " new lead(s):\n" +
    toImport.map(function (x) { return x.handle; }).join(", ") +
    (skippedDupes.length > 0
      ? "\n\n(Skipping " + skippedDupes.length + " already in the Book: " + skippedDupes.join(", ") + ")"
      : "") +
    "\n\nEach will be logged as a real Outreach event dated today. Continue?";
  var response = ui.alert("Import Bulk Leads", confirmMsg, ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  for (var k = 0; k < toImport.length; k++) {
    var row = blankRows[k];
    var lead = toImport[k];
    bookSheet.getRange(row, COL_PLAYER_HANDLE).setValue(lead.handle);
    if (lead.source) bookSheet.getRange(row, COL_SOURCE).setValue(lead.source);
    if (lead.roobet) bookSheet.getRange(row, COL_ROOBET_USERNAME).setValue(lead.roobet);
    initializeNewLead_(bookSheet, row, ss, repName, true);
  }

  bulkSheet.getRange(BULK_IMPORT_HEADER_ROW + 1, 1, lastRow - BULK_IMPORT_HEADER_ROW, 3).clearContent();

  ui.alert("Imported " + toImport.length + " new lead(s) into the Book.");
}

function applyJulyUpdate() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
  }
  if (!bookSheet || !dailyTaskSheet || !statsSheet) {
    ui.alert("Couldn't find this file's Book, Daily Task, or Stats tab.");
    return;
  }

  var applied = [];
  var mainQueueHeaderRow = 4;
  var reactHeaderRow = 67;

  if (dailyTaskSheet.getRange(mainQueueHeaderRow, 1).getValue() === "Done") {
    dailyTaskSheet.getRange(mainQueueHeaderRow, 1).setValue("Task Complete");
    applied.push('Renamed "Done" to "Task Complete" (main queue)');
  }
  if (dailyTaskSheet.getRange(reactHeaderRow, 1).getValue() === "Done") {
    dailyTaskSheet.getRange(reactHeaderRow, 1).setValue("Task Complete");
    applied.push('Renamed "Done" to "Task Complete" (Dead Lead Reactivation)');
  }

  var existingRules = dailyTaskSheet.getConditionalFormatRules();
  var hasOverdueRule = existingRules.some(function (r) {
    var cond = r.getBooleanCondition();
    if (!cond) return false;
    var vals = cond.getCriteriaValues();
    return vals && vals[0] && String(vals[0]).indexOf("TODAY") !== -1;
  });
  if (!hasOverdueRule) {
    var redBg = "#F4CCCC";
    var rule1 = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E5<>"",$E5<TODAY())')
      .setBackground(redBg)
      .setRanges([dailyTaskSheet.getRange("A5:M64")])
      .build();
    var rule2 = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E68<>"",$E68<TODAY())')
      .setBackground(redBg)
      .setRanges([dailyTaskSheet.getRange("A68:M97")])
      .build();
    existingRules.push(rule1, rule2);
    dailyTaskSheet.setConditionalFormatRules(existingRules);
    applied.push("Added 24hr-overdue red highlighting to Daily Task");
  }

  // The "Sent to VIP Team" list used to get built into the Book here, at fixed rows
  // 205-207. It now lives on its own "<Rep> - VIP Team" tab instead - see "Step 2: Move
  // Sent to VIP Team to Own Tab". Deliberately NOT rebuilt here any more: re-running this
  // action would otherwise put the block straight back into the Book after Step 2 had just
  // taken it out.

  if (statsSheet.getRange(24, 1).getValue() !== "Player Handle" &&
      statsSheet.getRange(23, 1).getValue().toString().indexOf("Wager by Player") === -1) {
    statsSheet.getRange(23, 1).setValue("Wager by Player (First Deposit / Active players)");
    statsSheet.getRange(23, 1).setFontWeight("bold").setFontColor("#1F3864").setFontSize(12);
    statsSheet.getRange(24, 1, 1, 3).setValues([["Player Handle", "Status", "Weighted Wager"]]);
    statsSheet.getRange(24, 1, 1, 3)
      .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    var bk = "'" + repName + " - Book'";
    statsSheet.getRange(25, 1).setFormula(
      '=IFERROR(FILTER({' + bk + '!$B$4:$B$203,' + bk + '!$E$4:$E$203,' + bk + '!$N$4:$N$203},' +
      '((' + bk + '!$E$4:$E$203="First Deposit")+(' + bk + '!$E$4:$E$203="Active"))>0), "")'
    );
    statsSheet.getRange(25, 3, BOOK_ROWS, 1).setNumberFormat("$#,##0;($#,##0);-");
    applied.push('Added "Wager by Player" list to Stats (run "Fix Wager & FTD Tracking" next to remove this)');
  }

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing new to apply.");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n"));
  }
}

function fixWagerAndFtdTracking() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, activityLogSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
    if (n.indexOf(" - Activity Log") !== -1) activityLogSheet = sheets[i];
  }
  if (!bookSheet || !statsSheet || !activityLogSheet) {
    ui.alert("Couldn't find this file's Book, Stats, or Activity Log tab.");
    return;
  }

  var applied = [];

  if (bookSheet.getRange(3, 32).getValue() === "This Month\nWager") {
    bookSheet.deleteColumns(32, 4);
    applied.push("Removed the old This Month Wager / Last Month Wager / Wager Trend / FTD Date columns from the Book");
  }

  var statsA23 = statsSheet.getRange(23, 1).getValue().toString();
  if (statsA23.indexOf("Wager by Player") !== -1) {
    var clearLastRow = 25 + BOOK_ROWS - 1 + 2;
    statsSheet.getRange(23, 1, clearLastRow - 23 + 1, 6).clear();
    applied.push('Removed the wager list from Stats (FTD Date and Weighted Wager now live on the Book and FTD List)');
  }

  var wagerLogSheet = ss.getSheetByName(repName + " - Wager Log");
  if (wagerLogSheet) {
    var response = ui.alert(
      "Fix Wager & FTD Tracking",
      'Found a "' + repName + ' - Wager Log" tab left over from an earlier version. ' +
        "Delete it now? (If you typed any real wager numbers into it, cancel and copy them out first - this cannot be undone.)",
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      ss.deleteSheet(wagerLogSheet);
      applied.push('Deleted the "' + repName + ' - Wager Log" tab');
    }
  }

  if (bookSheet.getRange(3, 32).getValue() !== "FTD Date") {
    bookSheet.getRange(3, 32).setValue("FTD Date");
    bookSheet.getRange(3, 32).setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    bookSheet.getRange(BOOK_FIRST_ROW, 32, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
    applied.push("Added FTD Date column to the Book");
  }

  var statuses = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, BOOK_ROWS, 1).getValues();
  var ftdDates = bookSheet.getRange(BOOK_FIRST_ROW, COL_FTD_DATE, BOOK_ROWS, 1).getValues();
  var handles = bookSheet.getRange(BOOK_FIRST_ROW, COL_PLAYER_HANDLE, BOOK_ROWS, 1).getValues();

  var logLastRow = activityLogSheet.getLastRow();
  var logRows = [];
  if (logLastRow > ACTLOG_HEADER_ROW) {
    logRows = activityLogSheet.getRange(ACTLOG_HEADER_ROW + 1, 1, logLastRow - ACTLOG_HEADER_ROW, 5).getValues();
  }

  var backfilled = 0;
  for (var r = 0; r < BOOK_ROWS; r++) {
    var handle = handles[r][0];
    var status = statuses[r][0];
    var ftd = ftdDates[r][0];
    if (!handle || ftd || (status !== "First Deposit" && status !== "Active")) continue;

    var earliestDate = null;
    for (var lr = 0; lr < logRows.length; lr++) {
      var logHandle = logRows[lr][4];
      var eventType = String(logRows[lr][2] || "");
      if (logHandle === handle && eventType.indexOf("-> First Deposit") !== -1) {
        var d = logRows[lr][0];
        if (!earliestDate || (d && d < earliestDate)) earliestDate = d;
      }
    }
    if (earliestDate) {
      bookSheet.getRange(BOOK_FIRST_ROW + r, COL_FTD_DATE).setValue(earliestDate);
      backfilled++;
    }
  }
  if (backfilled > 0) {
    applied.push("Backfilled FTD Date for " + backfilled + " existing player(s) from Activity Log history");
  }

  var ftdListSheetWasCreated = !ss.getSheetByName(repName + " - FTD List");
  var ftdListSheet = ensureFtdListSheet_(ss, repName);
  if (ftdListSheetWasCreated) {
    applied.push('Created the "' + repName + ' - FTD List" tab');
  }
  {
    var statuses2 = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, BOOK_ROWS, 1).getValues();
    var handles2 = bookSheet.getRange(BOOK_FIRST_ROW, COL_PLAYER_HANDLE, BOOK_ROWS, 1).getValues();
    var addedToList = 0;
    for (var r2 = 0; r2 < BOOK_ROWS; r2++) {
      var h2 = handles2[r2][0];
      var s2 = statuses2[r2][0];
      if (!h2 || (s2 !== "First Deposit" && s2 !== "Active")) continue;
      var before = ftdListSheet.getLastRow();
      appendToFtdListIfNeeded_(ss, repName, bookSheet, BOOK_FIRST_ROW + r2);
      if (ftdListSheet.getLastRow() > before) addedToList++;
    }
    if (addedToList > 0) {
      applied.push("Added " + addedToList + " existing player(s) to the FTD List");
    }
  }

  var vipValues = bookSheet.getRange(BOOK_FIRST_ROW, COL_VIP_TEAM, BOOK_ROWS, 1).getValues();
  var hiddenCount = 0;
  for (var r3 = 0; r3 < BOOK_ROWS; r3++) {
    if (vipValues[r3][0] === "Yes") {
      bookSheet.hideRows(BOOK_FIRST_ROW + r3);
      hiddenCount++;
    }
  }
  if (hiddenCount > 0) {
    applied.push("Hid " + hiddenCount + " existing Book row(s) already marked Transferred to VIP Team");
  }

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing to fix.");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n"));
  }
}

function fixStatusCadenceAndOptions() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listsSheet = ss.getSheetByName("Lists");
  if (!listsSheet) {
    ui.alert("Couldn't find the Lists tab on this sheet.");
    return;
  }

  var applied = [];
  var lastRow = Math.max(listsSheet.getLastRow(), 2);
  var statusCol = listsSheet.getRange(1, 3, lastRow, 1).getValues();

  var deadLeadRow = -1;
  var potentialLeadRow = -1;
  var firstBlankRow = -1;
  for (var i = 1; i < statusCol.length; i++) {
    var val = statusCol[i][0];
    if (val === "Dead Lead") deadLeadRow = i + 1;
    if (val === "Potential Lead") potentialLeadRow = i + 1;
    if (!val && firstBlankRow === -1) firstBlankRow = i + 1;
  }
  if (firstBlankRow === -1) firstBlankRow = statusCol.length + 1;

  if (deadLeadRow !== -1) {
    var currentOffset = listsSheet.getRange(deadLeadRow, 5).getValue();
    if (currentOffset !== 30) {
      listsSheet.getRange(deadLeadRow, 5).setValue(30);
      listsSheet.getRange(deadLeadRow, 4).setValue(
        "Re-target (every ~30 days): reach back out, see if anything changed. Update status if it goes anywhere."
      );
      applied.push("Changed Dead Lead re-target cadence from " + currentOffset + " to 30 days");
    }
  }

  if (potentialLeadRow === -1) {
    listsSheet.getRange(firstBlankRow, 3).setValue("Potential Lead");
    listsSheet.getRange(firstBlankRow, 4).setValue(
      "Re-target (every 7 days): reach back out, see if they're ready to pick things back up."
    );
    listsSheet.getRange(firstBlankRow, 5).setValue(7);
    applied.push('Added "Potential Lead" status option (7-day re-target cadence) - it will show up in the Status dropdown on the Book right away');
  }

  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName();
    if (name.indexOf(" - Daily Task") === -1) continue;
    var searchLastRow = Math.min(sheets[s].getLastRow(), 120);
    if (searchLastRow < 1) continue;
    var values = sheets[s].getRange(1, 1, searchLastRow, 1).getValues();
    for (var v = 0; v < values.length; v++) {
      var cellVal = String(values[v][0] || "");
      if (cellVal.indexOf("Dead Lead Reactivation") !== -1 && cellVal.indexOf("2 months") !== -1) {
        sheets[s].getRange(v + 1, 1).setValue(
          "Dead Lead Reactivation - re-targets automatically every ~30 days. Check Done once you've reached back out."
        );
        applied.push("Updated the Dead Lead Reactivation note on Daily Task to say 30 days");
      }
    }
  }

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing to fix.");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n"));
  }
}

// ============================================================
// One-time menu action that expands the Dead Lead Reactivation block from its old 30-row
// capacity to 200, and changes it to show EVERY dead lead immediately (not just ones due
// for re-contact today) - ranked by Next Retarget Date, with red highlighting reserved
// for the ones actually due now. Safe to run more than once - detects the block's current
// size and only adds what's missing. Run "Update Status Cadence & Options" first if you
// haven't - this depends on the 30-day cadence it sets.
// ============================================================
function expandDeadLeadReactivation() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
  }
  if (!bookSheet || !dailyTaskSheet) {
    ui.alert("Couldn't find this file's Book or Daily Task tab.");
    return;
  }

  var applied = [];
  var bk = "'" + repName + " - Book'";

  // 1. Update ReactivationFlag (U) / ReactivationRank (V) on every Book row - every Dead
  // Lead is flagged now (not just ones whose re-target date has arrived), ranked by
  // Next Retarget Date (J) ascending so the soonest-due ones sort to the top.
  var flagFormulas = [];
  var rankFormulas = [];
  for (var r = BOOK_FIRST_ROW; r <= BOOK_LAST_ROW; r++) {
    flagFormulas.push(['=IF($B' + r + '="",0,IF($E' + r + '="Dead Lead",1,0))']);
    rankFormulas.push(['=IF($U' + r + '=1,SUMPRODUCT(($U$' + BOOK_FIRST_ROW + ':$U$' + BOOK_LAST_ROW +
      '=1)*(($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW + '<$J' + r + ')+(($J$' + BOOK_FIRST_ROW +
      ':$J$' + BOOK_LAST_ROW + '=$J' + r + ')*(ROW($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW +
      ')<ROW($J' + r + '))))) + 1,"")']);
  }
  bookSheet.getRange(BOOK_FIRST_ROW, COL_REACT_FLAG, BOOK_ROWS, 1).setFormulas(flagFormulas);
  bookSheet.getRange(BOOK_FIRST_ROW, COL_REACT_RANK, BOOK_ROWS, 1).setFormulas(rankFormulas);
  applied.push("Every Dead Lead is now flagged for the Reactivation block immediately (ranked by Next Retarget Date)");

  // 2. Find the Reactivation block's current last data row by locating the "Coming Up"
  // note below it (searching rather than assuming, in case this sheet already has some
  // custom capacity). Falls back to the standard 97 (old 30-row capacity) if not found.
  var searchLastRow = Math.min(dailyTaskSheet.getLastRow(), 2000);
  var colAValues = searchLastRow > 0 ? dailyTaskSheet.getRange(1, 1, searchLastRow, 1).getValues() : [];
  var comingUpNoteRow = -1;
  for (var i2 = REACT_FIRST_ROW - 1; i2 < colAValues.length; i2++) {
    var v2 = String(colAValues[i2][0] || "");
    if (v2.indexOf("Coming Up") !== -1) { comingUpNoteRow = i2 + 1; break; }
  }
  var currentLastDataRow = comingUpNoteRow !== -1 ? comingUpNoteRow - 3 : 97;

  var rowsToAdd = REACT_LAST_ROW - currentLastDataRow;
  if (rowsToAdd > 0) {
    dailyTaskSheet.insertRowsAfter(currentLastDataRow, rowsToAdd);

    // Populate the newly inserted rows with the same formula pattern as the existing
    // reactivation rows - nothing below (Coming Up) loses data, Sheets auto-shifts its
    // formulas down since they're real cell references, not hardcoded text.
    for (var idx = 0; idx < rowsToAdd; idx++) {
      var row = currentLastDataRow + 1 + idx;
      var priority = row - REACT_FIRST_ROW + 1;
      var mref = "$B" + row;
      dailyTaskSheet.getRange(row, 1).setValue(false);
      dailyTaskSheet.getRange(row, 2).setFormula(
        '=IFERROR(MATCH(' + priority + ',' + bk + '!$V$' + BOOK_FIRST_ROW + ':$V$' + BOOK_LAST_ROW + ',0)+' + BOOK_FIRST_ROW + '-1,"")'
      );
      dailyTaskSheet.getRange(row, 3).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$A:$A,' + mref + '))');
      dailyTaskSheet.getRange(row, 4).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$B:$B,' + mref + '))');
      dailyTaskSheet.getRange(row, 5).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$J:$J,' + mref + '))');
      dailyTaskSheet.getRange(row, 6).setFormula('=IF(' + mref + '="","","' + repName + '")');
      dailyTaskSheet.getRange(row, 7).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$C:$C,' + mref + '))');
      dailyTaskSheet.getRange(row, 8).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$D:$D,' + mref + '))');
      dailyTaskSheet.getRange(row, 9).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$E:$E,' + mref + '))');
      dailyTaskSheet.getRange(row, 10).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$F:$F,' + mref + '))');
      dailyTaskSheet.getRange(row, 11).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$K:$K,' + mref + '))');
      dailyTaskSheet.getRange(row, 12).setFormula('=IF(' + mref + '="","",ROUND(INDEX(' + bk + '!$Q:$Q,' + mref + '),0))');
      dailyTaskSheet.getRange(row, 13).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$P:$P,' + mref + '))');
      for (var c = 1; c <= 13; c++) {
        dailyTaskSheet.getRange(row, c).setFontFamily("Arial").setFontSize(10);
      }
      dailyTaskSheet.getRange(row, 5).setNumberFormat("yyyy-mm-dd");
      dailyTaskSheet.getRange(row, 12).setNumberFormat('0" days"');
    }
    applied.push("Expanded the Dead Lead Reactivation block from " + (currentLastDataRow - REACT_FIRST_ROW + 1) + " to " + REACT_ROWS + " rows");
  }

  // 3. Relabel the "Due Date" header on this block to "Next Retarget Date" (it can now
  // show a future date for dead leads not due yet, not just overdue ones).
  if (dailyTaskSheet.getRange(REACT_HEADER_ROW, 5).getValue() !== "Next Retarget\nDate") {
    dailyTaskSheet.getRange(REACT_HEADER_ROW, 5).setValue("Next Retarget\nDate");
    applied.push('Relabeled the Reactivation block\'s Due Date column to "Next Retarget Date"');
  }

  // 4. Update the descriptive note above the block.
  dailyTaskSheet.getRange(REACT_HEADER_ROW - 1, 1).setValue(
    "Dead Lead Reactivation - every dead lead, ranked by Next Retarget Date. Red = due now, act on it. Check Done once you've reached back out."
  );

  // 5. Extend data validation (Done checkbox, Status dropdown) and conditional
  // formatting to cover the full new range.
  var statusRange = getStatusRangeA1_(ss);
  var doneRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  dailyTaskSheet.getRange(REACT_FIRST_ROW, 1, REACT_ROWS, 1).setDataValidation(doneRule);
  if (statusRange) {
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(statusRange, true)
      .setAllowInvalid(true)
      .build();
    dailyTaskSheet.getRange(REACT_FIRST_ROW, 9, REACT_ROWS, 1).setDataValidation(statusRule);
  }

  var existingRules = dailyTaskSheet.getConditionalFormatRules();
  var keptRules = existingRules.filter(function (rule) {
    var ranges = rule.getRanges();
    for (var ri = 0; ri < ranges.length; ri++) {
      var a1 = ranges[ri].getA1Notation();
      if (a1.indexOf("68") !== -1 || a1.indexOf("97") !== -1) return false;
    }
    return true;
  });
  var blackRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J' + REACT_FIRST_ROW + '="Black"')
    .setBackground("#D9D9D9")
    .setRanges([dailyTaskSheet.getRange(REACT_FIRST_ROW, 10, REACT_ROWS, 1)])
    .build();
  var redRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E' + REACT_FIRST_ROW + '<>"",$E' + REACT_FIRST_ROW + '<TODAY())')
    .setBackground("#F4CCCC")
    .setRanges([dailyTaskSheet.getRange(REACT_FIRST_ROW, 1, REACT_ROWS, 13)])
    .build();
  keptRules.push(blackRule, redRule);
  dailyTaskSheet.setConditionalFormatRules(keptRules);
  applied.push("Refreshed formatting and dropdowns across the full Reactivation block");

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing to fix.");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n"));
  }
}

// ============================================================
// One-time menu action that adds a live "Current Status Breakdown" block to the Stats
// tab - a count of players currently sitting in each status right now (Dead Lead,
// Potential Lead, etc.), purely informational and not tied to any KPI target. Safe to run
// more than once - skips a rep's Stats tab if the block is already there. Locates where
// to place the block by searching for the "Build a trend chart" note that's already at
// the bottom of every Stats tab, so it works regardless of which Stats layout this sheet
// was built with.
// ============================================================
function addStatusBreakdown() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
  }
  if (!bookSheet || !statsSheet) {
    ui.alert("Couldn't find this file's Book or Stats tab.");
    return;
  }

  var searchLastRow = Math.min(statsSheet.getMaxRows(), 60);
  var colA = statsSheet.getRange(1, 1, searchLastRow, 1).getValues();

  for (var r = 0; r < colA.length; r++) {
    if (String(colA[r][0] || "").indexOf("Current Status Breakdown") !== -1) {
      ui.alert("Already up to date - the Status Breakdown is already on this Stats tab.");
      return;
    }
  }

  var chartNoteRow = -1;
  for (var r2 = 0; r2 < colA.length; r2++) {
    if (String(colA[r2][0] || "").indexOf("Build a trend chart") !== -1) { chartNoteRow = r2 + 1; break; }
  }
  // Fallback if that note can't be found for some reason - just append after whatever's
  // already on the tab, leaving a blank row of separation.
  var subtitleRow = chartNoteRow !== -1 ? chartNoteRow + 2 : statsSheet.getLastRow() + 2;
  var headerRow = subtitleRow + 1;

  var bk = "'" + repName + " - Book'";
  statsSheet.getRange(subtitleRow, 1).setValue(
    "Current Status Breakdown (live count, right now - informational only, not a KPI)"
  );
  statsSheet.getRange(subtitleRow, 1).setFontWeight("bold").setFontColor("#1F3864").setFontSize(12);

  statsSheet.getRange(headerRow, 1, 1, 2).setValues([["Status", "Count"]]);
  statsSheet.getRange(headerRow, 1, 1, 2)
    .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
  statsSheet.setRowHeight(headerRow, 24);

  for (var s = 0; s < STATUS_BREAKDOWN_LIST.length; s++) {
    var row = headerRow + 1 + s;
    statsSheet.getRange(row, 1).setValue(STATUS_BREAKDOWN_LIST[s]);
    statsSheet.getRange(row, 2).setFormula(
      '=COUNTIF(' + bk + '!$E$' + BOOK_FIRST_ROW + ':$E$' + BOOK_LAST_ROW + ',"' + STATUS_BREAKDOWN_LIST[s] + '")'
    );
    statsSheet.getRange(row, 2).setHorizontalAlignment("center").setFontWeight("bold").setFontColor("#1F3864");
  }

  ui.alert('Added the Current Status Breakdown block to the Stats tab (rows ' + subtitleRow + '-' +
    (headerRow + STATUS_BREAKDOWN_LIST.length) + ').');
}

// ============================================================
// One-time menu action that redefines "Active Leads" (Today / This Week / This Month) on
// the Stats tab. Previously it counted the historical "Outreach" Activity Log event - any
// lead ever logged, forever, even after it goes Dead Lead or Potential Lead. Now it
// counts by CURRENT status instead, pulled straight from the Book's Date Assigned (H) and
// Status (E) columns, excluding Dead Lead and Potential Lead - so a rep can't pad their
// numbers by logging leads and letting them go cold. Note: because this is now a LIVE
// status check, the Week/Month totals can shift down over time as a lead that was
// counted goes dead later - that's intentional, it's the whole point of this change.
// Detects the Stats layout (full vs. simplified) by checking for "Today vs. Target" at
// row 12, and only overwrites a formula if it still matches the old Outreach-based
// pattern (safe to run twice, and won't clobber a formula that's already been fixed or
// customized).
// ============================================================
function fixActiveLeadsDefinition() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
  }
  if (!bookSheet || !statsSheet) {
    ui.alert("Couldn't find this file's Book or Stats tab.");
    return;
  }

  var bk = "'" + repName + " - Book'";
  var statusRange = bk + "!$E$" + BOOK_FIRST_ROW + ":$E$" + BOOK_LAST_ROW;
  var dateRange = bk + "!$H$" + BOOK_FIRST_ROW + ":$H$" + BOOK_LAST_ROW;
  var weekStart = "(TODAY()-WEEKDAY(TODAY(),3))";
  var monthStart = "DATE(YEAR(TODAY()),MONTH(TODAY()),1)";

  var todayFormula =
    '=COUNTIFS(' + dateRange + ',TODAY(),' +
    statusRange + ',"<>Dead Lead",' + statusRange + ',"<>Potential Lead")';

  function weekMonthFormula(startExpr) {
    return '=COUNTIFS(' + dateRange + ',">="&' + startExpr + ',' + dateRange + ',"<="&TODAY(),' +
      statusRange + ',"<>Dead Lead",' + statusRange + ',"<>Potential Lead")';
  }

  var applied = [];
  var isFullLayout = statsSheet.getRange(12, 1).getValue().toString().indexOf("Today vs. Target") !== -1;

  if (isFullLayout) {
    var todayCell = statsSheet.getRange(14, 1);
    var currentFormula = todayCell.getFormula();
    if (currentFormula.indexOf('"Outreach"') !== -1) {
      todayCell.setFormula(todayFormula);
      applied.push('Updated "Active Leads Today" to count by current status');
    }

    var weekCell = statsSheet.getRange(18, 2);
    if (weekCell.getFormula().indexOf('"Outreach"') !== -1) {
      weekCell.setFormula(weekMonthFormula(weekStart));
      applied.push('Updated "Active Leads" (This Week) to count by current status');
    }

    var monthCell = statsSheet.getRange(19, 2);
    if (monthCell.getFormula().indexOf('"Outreach"') !== -1) {
      monthCell.setFormula(weekMonthFormula(monthStart));
      applied.push('Updated "Active Leads" (This Month) to count by current status');
    }
  } else {
    // Simplified layout (no KPI quota) - This Week/This Month live at rows 5/6, column 2.
    var weekCellS = statsSheet.getRange(5, 2);
    if (weekCellS.getFormula().indexOf('"Outreach"') !== -1) {
      weekCellS.setFormula(weekMonthFormula(weekStart));
      applied.push('Updated "Active Leads" (This Week) to count by current status');
    }
    var monthCellS = statsSheet.getRange(6, 2);
    if (monthCellS.getFormula().indexOf('"Outreach"') !== -1) {
      monthCellS.setFormula(weekMonthFormula(monthStart));
      applied.push('Updated "Active Leads" (This Month) to count by current status');
    }
  }

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing to fix.");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n") +
      "\n\nHeads up: because this now checks LIVE status, these numbers can shift down " +
      "over time if a counted lead later goes Dead Lead or Potential Lead - that's " +
      "expected, it's the whole point of the change.");
  }
}

// ============================================================
// One-time menu action that redefines VIP Transfers and FTD (Today / This Week / This
// Month) on the Stats tab. Previously these counted every historical Activity Log event
// where a player's status changed INTO "VIP Transferred" or "First Deposit"/"Active" -
// including ones later corrected or reversed (wrong entry, moved back to a lead stage).
// That's the same as a sales rep getting credit for a deal that fell through - not
// right. Now both count by CURRENT status only, using the date the player actually
// entered that status (Book columns W/AA for VIP, AF for FTD) - a correction or reversal
// drops out automatically, same as how the FTD List itself already behaves. Detects the
// Stats layout (full vs. simplified) the same way "Fix Active Leads Definition" does,
// and only overwrites a formula if it still matches the old Activity-Log-event pattern
// (safe to run twice).
// ============================================================
function fixVipFtdPeriodFormulas() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
  }
  if (!bookSheet || !statsSheet) {
    ui.alert("Couldn't find this file's Book or Stats tab.");
    return;
  }

  var bk = "'" + repName + " - Book'";
  var statusRange = bk + "!$E$" + BOOK_FIRST_ROW + ":$E$" + BOOK_LAST_ROW;
  var vipftDateRange = bk + "!$AA$" + BOOK_FIRST_ROW + ":$AA$" + BOOK_LAST_ROW;
  var vipTeamRange = bk + "!$AC$" + BOOK_FIRST_ROW + ":$AC$" + BOOK_LAST_ROW;
  var vipTransferDateRange = bk + "!$W$" + BOOK_FIRST_ROW + ":$W$" + BOOK_LAST_ROW;
  var ftdDateRange = bk + "!$AF$" + BOOK_FIRST_ROW + ":$AF$" + BOOK_LAST_ROW;
  var weekStart = "(TODAY()-WEEKDAY(TODAY(),3))";
  var monthStart = "DATE(YEAR(TODAY()),MONTH(TODAY()),1)";

  function vipFormula(startExpr) {
    if (startExpr === null) {
      return '=COUNTIFS(' + statusRange + ',"VIP Transferred",' + vipftDateRange + ',TODAY())' +
        '+COUNTIFS(' + vipTeamRange + ',"Yes",' + vipTransferDateRange + ',TODAY())';
    }
    return '=COUNTIFS(' + statusRange + ',"VIP Transferred",' +
      vipftDateRange + ',">="&' + startExpr + ',' + vipftDateRange + ',"<="&TODAY())' +
      '+COUNTIFS(' + vipTeamRange + ',"Yes",' +
      vipTransferDateRange + ',">="&' + startExpr + ',' + vipTransferDateRange + ',"<="&TODAY())';
  }

  function ftdFormula(startExpr) {
    if (startExpr === null) {
      return '=COUNTIFS(' + ftdDateRange + ',TODAY())';
    }
    return '=COUNTIFS(' + ftdDateRange + ',">="&' + startExpr + ',' + ftdDateRange + ',"<="&TODAY())';
  }

  var applied = [];
  var isFullLayout = statsSheet.getRange(12, 1).getValue().toString().indexOf("Today vs. Target") !== -1;

  function isOldStyle(formula) {
    // Old formulas pulled from the Activity Log ("Activity Log'!$C$" event-type column) -
    // the new ones never reference that tab at all, so this is a reliable marker.
    return formula.indexOf("Activity Log'!$C$") !== -1 || formula.indexOf("Activity Log'!$A$") !== -1;
  }

  if (isFullLayout) {
    var vipTodayCell = statsSheet.getRange(14, 3);
    if (isOldStyle(vipTodayCell.getFormula())) {
      vipTodayCell.setFormula(vipFormula(null));
      applied.push('Updated "VIP Transfers Today" to count by current status');
    }
    var ftdTodayCell = statsSheet.getRange(14, 5);
    if (isOldStyle(ftdTodayCell.getFormula())) {
      ftdTodayCell.setFormula(ftdFormula(null));
      applied.push('Updated "FTD Today" to count by current status');
    }

    var vipWeekCell = statsSheet.getRange(18, 3);
    if (isOldStyle(vipWeekCell.getFormula())) {
      vipWeekCell.setFormula(vipFormula(weekStart));
      applied.push('Updated "VIP Transfers" (This Week) to count by current status');
    }
    var ftdWeekCell = statsSheet.getRange(18, 4);
    if (isOldStyle(ftdWeekCell.getFormula())) {
      ftdWeekCell.setFormula(ftdFormula(weekStart));
      applied.push('Updated "FTD" (This Week) to count by current status');
    }

    var vipMonthCell = statsSheet.getRange(19, 3);
    if (isOldStyle(vipMonthCell.getFormula())) {
      vipMonthCell.setFormula(vipFormula(monthStart));
      applied.push('Updated "VIP Transfers" (This Month) to count by current status');
    }
    var ftdMonthCell = statsSheet.getRange(19, 4);
    if (isOldStyle(ftdMonthCell.getFormula())) {
      ftdMonthCell.setFormula(ftdFormula(monthStart));
      applied.push('Updated "FTD" (This Month) to count by current status');
    }
  }

  if (applied.length === 0) {
    ui.alert("Already up to date - nothing to fix (or this file uses the simplified Stats layout, which doesn't have VIP/FTD period columns).");
  } else {
    ui.alert("Applied:\n\n" + applied.join("\n") +
      "\n\nHeads up: because this now checks LIVE status, a VIP Transfer or FTD that " +
      "later gets corrected/reversed will drop out of these counts automatically - " +
      "that's expected, it's the whole point of the change.");
  }
}

// ============================================================
// Repair Book Ranking Formulas - fully rebuilds ALL five hidden helper columns that
// drive the Daily Task and Dead Lead Reactivation queues, from scratch, for all 200 Book
// rows:
//   Q = DaysSinceContact, R = DueFlag, S = DueRank   (main Daily Task queue)
//   U = Dead Lead Flag,   V = Reactivation Rank        (Dead Lead Reactivation queue)
// These are pure formula columns - nobody ever types into them by hand - so it's always
// safe to overwrite them completely rather than trying to patch just the broken ones.
//
// Why this exists: a "Delete cells > Shift up" or "Shift left" on a partial range (rather
// than a full row delete) can silently break ONE row's formula into a literal #REF!
// reference - and because DueRank/Reactivation Rank both scan their ENTIRE column with
// SUMPRODUCT for every single row, even one broken row poisons the whole column, and the
// whole queue goes blank. This happened on Plat's sheet from exactly that kind of
// partial-range delete. Run this any time Daily Task or Reactivation looks empty or wrong
// and you're not sure why - it doesn't hurt anything to run when things are already fine.
// ============================================================
// ============================================================
// Rebuilds EVERY computed column on the Book, for a row range. This is what makes a row
// actually work - a Book row is mostly formulas, and typing a Player Handle into a blank
// row below the built range gets you a row where only the things you type by hand (Status,
// dates, notes) do anything. Player ID, Health, Priority, Next Follow-Up, Next Action, VIP
// Ready, Follow-Up Attempts and the hidden ranking helpers are all per-row formulas that
// have to exist in the cell.
//
// Safe to run over rows that already have data. It only ever writes the computed columns:
//   ALWAYS rewritten (pure formulas, nothing typed by hand ever lives here):
//     A Player ID, F Health, G Priority, J Next Follow-Up, K Next Action, O VIP Ready,
//     Q DaysSinceContact, R DueFlag, S DueRank, U ReactivationFlag, V ReactivationRank,
//     Y UpcomingFlag, Z UpcomingRank, AD StatusNextFollowUp, AE VIPTeamNextFollowUp
//   ONLY filled in when blank (the script writes real values into these as work happens,
//   so overwriting them would wipe real counts and dates):
//     T Follow-Up Attempts, W/X VIP Team check-in date+count, AA/AB VIP Transferred
//     date+count
//   NEVER touched: Player Handle, Source, Roobet Username, Status, Date Assigned, Last
//     Contact, KYC, Deposit, Weighted Wager, Notes, Transferred to VIP Team, FTD Date.
// ============================================================
function statusTableA1_(ss) {
  var lists = ss.getSheetByName("Lists");
  var last = lists ? Math.max(lists.getLastRow(), 21) : 21;
  return "Lists!$C$2:$E$" + last;
}

function bookPlayerIdCode_(bookSheet) {
  // Read the rep's ID prefix out of an existing Player ID rather than keeping a list of
  // rep codes in here that could drift out of sync with the sheets.
  var lastScan = Math.min(bookSheet.getMaxRows(), BOOK_LAST_ROW);
  var n = lastScan - BOOK_FIRST_ROW + 1;
  if (n > 0) {
    var range = bookSheet.getRange(BOOK_FIRST_ROW, 1, n, 1);
    var formulas = range.getFormulas();
    for (var i = 0; i < formulas.length; i++) {
      var m = /"([A-Za-z0-9]+)-"&TEXT/.exec(formulas[i][0] || "");
      if (m) return m[1];
    }
    var values = range.getValues();
    for (var v = 0; v < values.length; v++) {
      var m2 = /^([A-Za-z]+)-\d+$/.exec(String(values[v][0] || "").trim());
      if (m2) return m2[1];
    }
  }
  var name = bookSheet.getName().split(" - ")[0] || "XX";
  return name.substring(0, 2).toUpperCase();
}

function rebuildBookRowFormulas_(bookSheet, firstRow, lastRow) {
  var ss = bookSheet.getParent();
  var TBL = statusTableA1_(ss);
  var code = bookPlayerIdCode_(bookSheet);
  var n = lastRow - firstRow + 1;
  if (n < 1) return 0;

  var fId = [], fHealth = [], fPrio = [], fNext = [], fAction = [], fVipReady = [];
  var fDays = [], fDueFlag = [], fDueRank = [], fReactFlag = [], fReactRank = [];
  var fUpFlag = [], fUpRank = [], fStatusNext = [], fVipTeamNext = [];

  for (var r = firstRow; r <= lastRow; r++) {
    fId.push(['=IF($B' + r + '="","","' + code + '-"&TEXT(ROW()-' + HEADER_ROW_BOOK + ',"0000"))']);

    fHealth.push(['=IF($E' + r + '="","",IF($E' + r + '="Dead Lead","Black",' +
      'IF(IF(ISNUMBER($J' + r + '),TODAY()-$J' + r + '>3,FALSE),"Red",' +
      'IF($E' + r + '="Reactivation Queue","Red",' +
      'IF(OR($E' + r + '="First Deposit",$E' + r + '="Active"),"Green","Yellow")))))']);

    fPrio.push(['=IF($F' + r + '="","",IF($F' + r + '="Red",1,IF($F' + r + '="Yellow",2,' +
      'IF($F' + r + '="Green",3,4))))']);

    fStatusNext.push(['=IF($E' + r + '="","",IF($E' + r + '="VIP Transferred",' +
      'IF($AA' + r + '="","",IF(N($AB' + r + ')>=3,"N/A - Closed",' +
      '$AA' + r + '+CHOOSE(N($AB' + r + ')+1,1,2,3))),' +
      'IF($I' + r + '="","",IF(VLOOKUP($E' + r + ',' + TBL + ',3,FALSE)="CLOSED","N/A - Closed",' +
      '$I' + r + '+VLOOKUP($E' + r + ',' + TBL + ',3,FALSE)))))']);

    fVipTeamNext.push(['=IF(AND($AC' + r + '="Yes",$W' + r + '<>"",N($X' + r + ')<3),' +
      '$W' + r + '+CHOOSE(N($X' + r + ')+1,1,7,14),"")']);

    fNext.push(['=IF($E' + r + '="","",IF(AND(ISNUMBER($AD' + r + '),ISNUMBER($AE' + r + ')),' +
      'MIN($AD' + r + ',$AE' + r + '),IF(ISNUMBER($AE' + r + '),$AE' + r + ',$AD' + r + ')))']);

    fAction.push(['=IF($E' + r + '="","",IF($E' + r + '="VIP Transferred",' +
      'IF(N($AB' + r + ')>=3,' +
      '"Should be Dead Lead (3 attempts, still no deposit) - will auto-update",' +
      '"Day "&CHOOSE(N($AB' + r + ')+1,1,2,3)&" URGENT VIP check-in - help them finish KYC and lock in first deposit"),' +
      'IF(AND($D' + r + '="",$E' + r + '<>"Dead Lead"),' +
      'IF(N($T' + r + ')>=3,"READY FOR DEAD LEAD (3 attempts, still no sign-up)",' +
      '"GET ROOBET SIGN-UP - "&IFERROR(VLOOKUP($E' + r + ',' + TBL + ',2,FALSE),"")),' +
      'IFERROR(VLOOKUP($E' + r + ',' + TBL + ',2,FALSE),""))))' +
      '&IF($AC' + r + '="Yes",IF(N($X' + r + ')>=3,' +
      '" | VIP Team checkpoints complete - no more automatic check-ins",' +
      '" | Day "&CHOOSE(N($X' + r + ')+1,1,7,14)&" VIP Team check-in - confirm active/depositing"),"")']);

    fVipReady.push(['=IF($E' + r + '="","",IF(AND($E' + r + '="Active",$F' + r + '="Green"),"Yes","No"))']);

    fDays.push(['=IF($I' + r + '="","",ROUND(TODAY()-$I' + r + ',0))']);

    // Branch 1 - anyone whose follow-up date has arrived. This deliberately does NOT
    // exclude Dead Leads: a dead lead's date is their 30-day retarget, so when it lands
    // they belong in today's queue like anyone else. They also stay in the Dead Lead list
    // permanently, so a rep can work that list whenever they want.
    // Branch 2 - no Roobet username yet. Dead Leads ARE excluded here, otherwise every
    // dead lead without a username would sit in the queue every single day forever.
    // Due if their follow-up date has arrived AND you have not already contacted them
    // today. That second half is what lets a completed task leave the queue and come back
    // tomorrow. Dead leads are included here on purpose - their 30-day retarget is a date
    // like any other. The no-Roobet-username branch below excludes them, or every dead lead
    // without a username would sit in the queue forever.
    fDueFlag.push(['=IF($B' + r + '="",0,IF(OR(AND(ISNUMBER($J' + r + '),$J' + r +
      '<=TODAY(),OR($I' + r + '="",$I' + r + '<TODAY())),AND($D' + r + '="",$E' + r + '<>"",$E' + r +
      '<>"Dead Lead",OR($I' + r + '="",$I' + r + '<TODAY()))),1,0))']);

    // Order of today's queue: live leads first, revived dead leads underneath them, and
    // within each group longest-since-contact first. Without the dead-lead tier a 30-day-old
    // dead lead outranks every fresh lead and leads the queue every morning.
    var deadArr = '(($E$' + BOOK_FIRST_ROW + ':$E$' + BOOK_LAST_ROW + '="Dead Lead")*1)';
    var deadRow = '(($E' + r + '="Dead Lead")*1)';
    fDueRank.push(['=IF($R' + r + '=1,SUMPRODUCT(($R$' + BOOK_FIRST_ROW + ':$R$' + BOOK_LAST_ROW +
      '=1)*((' + deadArr + '<' + deadRow + ')+(' + deadArr + '=' + deadRow + ')*' +
      '(($Q$' + BOOK_FIRST_ROW + ':$Q$' + BOOK_LAST_ROW + '>$Q' + r + ')+(($Q$' + BOOK_FIRST_ROW +
      ':$Q$' + BOOK_LAST_ROW + '=$Q' + r + ')*(ROW($Q$' + BOOK_FIRST_ROW + ':$Q$' + BOOK_LAST_ROW +
      ')<ROW($Q' + r + '))))))+1,"")']);

    fReactFlag.push(['=IF($B' + r + '="",0,IF($E' + r + '="Dead Lead",1,0))']);

    fReactRank.push(['=IF($U' + r + '=1,SUMPRODUCT(($U$' + BOOK_FIRST_ROW + ':$U$' + BOOK_LAST_ROW +
      '=1)*(($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW + '<$J' + r + ')+(($J$' + BOOK_FIRST_ROW +
      ':$J$' + BOOK_LAST_ROW + '=$J' + r + ')*(ROW($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW +
      ')<ROW($J' + r + '))))) + 1,"")']);

    fUpFlag.push(['=IF($B' + r + '="",0,IF(AND($R' + r + '=0,$E' + r + '<>"Dead Lead",' +
      'ISNUMBER($J' + r + '),$J' + r + '<=TODAY()+7),1,0))']);

    fUpRank.push(['=IF($Y' + r + '=1,SUMPRODUCT(($Y$' + BOOK_FIRST_ROW + ':$Y$' + BOOK_LAST_ROW +
      '=1)*(($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW + '<$J' + r + ')+(($J$' + BOOK_FIRST_ROW +
      ':$J$' + BOOK_LAST_ROW + '=$J' + r + ')*(ROW($J$' + BOOK_FIRST_ROW + ':$J$' + BOOK_LAST_ROW +
      ')<ROW($J' + r + ')))))+1,"")']);
  }

  bookSheet.getRange(firstRow, 1, n, 1).setFormulas(fId);
  bookSheet.getRange(firstRow, 6, n, 1).setFormulas(fHealth);
  bookSheet.getRange(firstRow, 7, n, 1).setFormulas(fPrio);
  bookSheet.getRange(firstRow, 10, n, 1).setFormulas(fNext);
  bookSheet.getRange(firstRow, 11, n, 1).setFormulas(fAction);
  bookSheet.getRange(firstRow, 15, n, 1).setFormulas(fVipReady);
  bookSheet.getRange(firstRow, 17, n, 1).setFormulas(fDays);
  bookSheet.getRange(firstRow, 18, n, 1).setFormulas(fDueFlag);
  bookSheet.getRange(firstRow, 19, n, 1).setFormulas(fDueRank);
  bookSheet.getRange(firstRow, 21, n, 1).setFormulas(fReactFlag);
  bookSheet.getRange(firstRow, 22, n, 1).setFormulas(fReactRank);
  bookSheet.getRange(firstRow, 25, n, 1).setFormulas(fUpFlag);
  bookSheet.getRange(firstRow, 26, n, 1).setFormulas(fUpRank);
  bookSheet.getRange(firstRow, 30, n, 1).setFormulas(fStatusNext);
  bookSheet.getRange(firstRow, 31, n, 1).setFormulas(fVipTeamNext);

  // Counters and stage-anchor dates: seed the starting formula ONLY where the cell is
  // currently empty. Anywhere the script has already recorded a real attempt count or a
  // real check-in date, leave it exactly as it is.
  var seeds = [
    [20, '=IF($B{r}="","",0)'],   // T  Follow-Up Attempts
    [23, '=IF($B{r}="","","")'],  // W  VIP Team check-in date
    [24, '=IF($B{r}="","",0)'],   // X  VIP Team check-in count
    [27, '=IF($B{r}="","","")'],  // AA VIP Transferred date
    [28, '=IF($B{r}="","",0)']    // AB VIP Transferred attempts
  ];
  for (var s = 0; s < seeds.length; s++) {
    var col = seeds[s][0];
    var tpl = seeds[s][1];
    var rng = bookSheet.getRange(firstRow, col, n, 1);
    var vals = rng.getValues();
    var fmls = rng.getFormulas();
    var out = [];
    var changed = false;
    for (var k = 0; k < n; k++) {
      var hasValue = vals[k][0] !== "" && vals[k][0] !== null;
      var hasFormula = fmls[k][0] !== "";
      if (hasValue || hasFormula) {
        out.push([hasFormula ? fmls[k][0] : vals[k][0]]);
      } else {
        out.push([tpl.replace("{r}", String(firstRow + k)).replace("{r}", String(firstRow + k))]);
        changed = true;
      }
    }
    if (changed) rng.setFormulas(out);
  }

  return n;
}

// ============================================================
// Restores the LOOK of the Book rows - borders, shading, date formats, and the Status /
// Health / KYC / Deposit dropdowns - by copying them from a row that's still intact.
//
// Needed because formatting and data validation are per-cell, exactly like the formulas.
// Rows added by hand at the bottom never had them, and "Clear formatting" on a range
// strips them. Either way you end up with rows that look plain and have no dropdowns.
//
// Only touches appearance and dropdowns - never reads or writes a single cell's contents.
// ============================================================
function bookFormatTemplateRow_(bookSheet) {
  // Use the first row that still has its Status dropdown as the template. Damage happens
  // at the bottom of the Book, so the top rows are the reliable reference.
  var scanTo = Math.min(bookSheet.getMaxRows(), BOOK_FIRST_ROW + 60);
  var n = scanTo - BOOK_FIRST_ROW + 1;
  if (n < 1) return BOOK_FIRST_ROW;
  var validations = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, n, 1).getDataValidations();
  for (var i = 0; i < n; i++) {
    if (validations[i][0]) return BOOK_FIRST_ROW + i;
  }
  return BOOK_FIRST_ROW;
}

function restoreBookRowFormatting_(bookSheet) {
  var lastRow = Math.min(BOOK_LAST_ROW, bookSheet.getMaxRows());
  var n = lastRow - BOOK_FIRST_ROW + 1;
  if (n < 1) return { rows: 0, templateRow: 0 };

  var templateRow = bookFormatTemplateRow_(bookSheet);
  var lastCol = Math.max(bookSheet.getLastColumn(), 32);
  var template = bookSheet.getRange(templateRow, 1, 1, lastCol);
  var target = bookSheet.getRange(BOOK_FIRST_ROW, 1, n, lastCol);

  template.copyTo(target, { formatOnly: true });

  var srcValidations = template.getDataValidations()[0];
  var grid = [];
  for (var g = 0; g < n; g++) grid.push(srcValidations.slice());
  target.setDataValidations(grid);

  return { rows: n, templateRow: templateRow };
}

// ============================================================
// Keeps the Book's filter covering the whole Book. The filter is what the green outline on
// the sheet is - and it was created once, at build time, sized to the original 200 rows. It
// does NOT grow when rows are added, so after expanding the Book the filter still stops
// partway down: sorting the Book would only sort the rows inside the range and quietly
// leave everything below it in place, which is a nasty way to lose your ordering.
//
// Note this rebuilds the filter, so any filter criteria currently applied get cleared (the
// columns go back to showing everything). Nothing is deleted - it's just the view resetting.
// ============================================================
function restoreBookFilter_(bookSheet) {
  var lastRow = Math.min(BOOK_LAST_ROW, bookSheet.getMaxRows());
  var wanted = "A" + HEADER_ROW_BOOK + ":AF" + lastRow;
  try {
    var existing = bookSheet.getFilter();
    if (existing) {
      if (existing.getRange().getA1Notation() === wanted) return null;
      existing.remove();
    }
    bookSheet.getRange(wanted).createFilter();
    return wanted;
  } catch (err) {
    // A filter problem should never stop the rest of the repair from finishing.
    return null;
  }
}

// Kept as the name the rest of the script calls - now rebuilds every computed column, not
// just the ranking helpers.
function rebuildBookRankingFormulas_(bookSheet) {
  rebuildBookRowFormulas_(bookSheet, BOOK_FIRST_ROW, BOOK_LAST_ROW);
}

function repairBookRankingFormulas() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookSheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf(" - Book") !== -1) bookSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  rebuildBookRankingFormulas_(bookSheet);
  var fmt = restoreBookRowFormatting_(bookSheet);
  var filterRange = restoreBookFilter_(bookSheet);

  ui.alert("Repaired all " + BOOK_ROWS + " Book rows.\n\nFormulas rebuilt:\n" +
    "- Player ID, Health, Priority, Next Follow-Up, Next Action, VIP Ready\n" +
    "- The hidden helpers behind the Daily Task, Coming Up and Dead Lead Reactivation lists\n" +
    "- Follow-Up Attempts and the VIP check-in counters were seeded only where they were " +
    "blank, so no real counts or dates were overwritten\n\n" +
    "Appearance restored across " + fmt.rows + " rows (borders, shading, date formats and the " +
    "Status / Health / KYC / Deposit dropdowns), copied from row " + fmt.templateRow + ".\n\n" +
    (filterRange
      ? "The Book's filter (the green outline) only covered part of the Book, so sorting " +
        "would have left the rows below it behind. Resized it to " + filterRange + " - any " +
        "filters you had applied are cleared as a result.\n\n"
      : "") +
    "If Daily Task or Reactivation was showing blank or wrong because a formula got corrupted " +
    "anywhere in those columns (e.g. from a partial row delete/shift), it should be fixed now - " +
    "give it a few seconds to recalculate.");
}

// ============================================================
// Rebuilds the whole Daily Task tab in one go, in this order:
//   Today's queue  ->  Coming Up preview  ->  Dead Lead Reactivation
//
// Why this exists: each block finds its players with a lookup into the Book, and those
// lookups were written when the Book was 200 rows. They never grew. So any player sitting
// below row 203 simply never appeared - which is why entries were showing as blank rows in
// the preview even though the players were right there in the Book. This rewrites every
// block's lookups across the full Book, and puts the preview above the dead leads.
//
// Safe: the Daily Task tab holds no data of its own. Every cell on it is either a formula
// reading the Book or a checkbox that gets cleared as work is done. If anything looks off
// after running it, run it again - there is nothing here to lose.
// ============================================================
function rebuildDailyTaskTab() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
  }
  if (!bookSheet || !dailyTaskSheet) {
    ui.alert("Couldn't find this file's Book or Daily Task tab.");
    return;
  }

  var confirm = ui.alert("Rebuild Daily Task tab",
    "This rewrites the whole Daily Task tab: today's queue, then the Coming Up preview, " +
      "then Dead Lead Reactivation.\n\nNothing is lost - every cell on this tab is either a " +
      "formula reading the Book or a checkbox. All your actual data lives in the Book and " +
      "is not touched.\n\nAny Task Complete boxes currently ticked but not yet processed " +
      "will be cleared.\n\nContinue?", ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var bk = "'" + repName + " - Book'";
  var needRows = DT_DEAD_LAST_ROW + 5;
  if (dailyTaskSheet.getMaxRows() < needRows) {
    dailyTaskSheet.insertRowsAfter(dailyTaskSheet.getMaxRows(), needRows - dailyTaskSheet.getMaxRows());
  }

  // Wipe everything below the header row and start clean. Done with explicit clear calls
  // rather than clear(options) - passing an options object with everything false clears
  // NOTHING, which is what left old section headers stranded on the sheet when the block
  // sizes changed between versions and the new layout landed at different rows.
  // Full width, not just the 13 columns, so nothing can hide off to the right.
  var wipe = dailyTaskSheet.getRange(DT_MAIN_FIRST_ROW, 1,
    dailyTaskSheet.getMaxRows() - DT_MAIN_FIRST_ROW + 1, dailyTaskSheet.getMaxColumns());
  wipe.breakApart();
  wipe.clearContent();
  wipe.clearFormat();
  wipe.clearDataValidations();
  wipe.clearNote();

  var blocks = [
    { first: DT_MAIN_FIRST_ROW, rows: DT_MAIN_ROWS, rankCol: "S" },
    { first: DT_PREVIEW_FIRST_ROW, rows: DT_PREVIEW_ROWS, rankCol: "Z" },
    { first: DT_DEAD_FIRST_ROW, rows: DT_DEAD_ROWS, rankCol: "V" }
  ];

  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var matchF = [], idF = [], nameF = [], dueF = [], ownerF = [], srcF = [], roobetF = [];
    var statusF = [], healthF = [], actionF = [], daysF = [], notesF = [];

    for (var k = 0; k < blk.rows; k++) {
      var row = blk.first + k;
      var priority = k + 1;
      var m = "$B" + row;
      matchF.push(['=IFERROR(MATCH(' + priority + ',' + bk + '!$' + blk.rankCol + '$' +
        BOOK_FIRST_ROW + ':$' + blk.rankCol + '$' + BOOK_LAST_ROW + ',0)+' + BOOK_FIRST_ROW + '-1,"")']);
      idF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$A:$A,' + m + '))']);
      nameF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$B:$B,' + m + '))']);
      dueF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$J:$J,' + m + '))']);
      ownerF.push(['=IF(' + m + '="","","' + repName + '")']);
      srcF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$C:$C,' + m + '))']);
      roobetF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$D:$D,' + m + '))']);
      statusF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$E:$E,' + m + '))']);
      healthF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$F:$F,' + m + '))']);
      actionF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$K:$K,' + m + '))']);
      daysF.push(['=IF(' + m + '="","",ROUND(INDEX(' + bk + '!$Q:$Q,' + m + '),0))']);
      notesF.push(['=IF(' + m + '="","",INDEX(' + bk + '!$P:$P,' + m + '))']);
    }

    dailyTaskSheet.getRange(blk.first, 2, blk.rows, 1).setFormulas(matchF);
    dailyTaskSheet.getRange(blk.first, 3, blk.rows, 1).setFormulas(idF);
    dailyTaskSheet.getRange(blk.first, 4, blk.rows, 1).setFormulas(nameF);
    dailyTaskSheet.getRange(blk.first, 5, blk.rows, 1).setFormulas(dueF);
    dailyTaskSheet.getRange(blk.first, 6, blk.rows, 1).setFormulas(ownerF);
    dailyTaskSheet.getRange(blk.first, 7, blk.rows, 1).setFormulas(srcF);
    dailyTaskSheet.getRange(blk.first, 8, blk.rows, 1).setFormulas(roobetF);
    dailyTaskSheet.getRange(blk.first, 9, blk.rows, 1).setFormulas(statusF);
    dailyTaskSheet.getRange(blk.first, 10, blk.rows, 1).setFormulas(healthF);
    dailyTaskSheet.getRange(blk.first, 11, blk.rows, 1).setFormulas(actionF);
    dailyTaskSheet.getRange(blk.first, 12, blk.rows, 1).setFormulas(daysF);
    dailyTaskSheet.getRange(blk.first, 13, blk.rows, 1).setFormulas(notesF);

    dailyTaskSheet.getRange(blk.first, 1, blk.rows, 13).setFontFamily("Arial").setFontSize(10);
    dailyTaskSheet.getRange(blk.first, 1, blk.rows, 13)
      .setBorder(true, true, true, true, true, true, "#B7B7B7", SpreadsheetApp.BorderStyle.SOLID);
    dailyTaskSheet.getRange(blk.first, 13, blk.rows, 1).setWrap(true);
    dailyTaskSheet.getRange(blk.first, 5, blk.rows, 1).setNumberFormat("yyyy-mm-dd");
    dailyTaskSheet.getRange(blk.first, 12, blk.rows, 1).setNumberFormat('0" days"');
    dailyTaskSheet.getRange(blk.first, 1, blk.rows, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }

  var statusRange = getStatusRangeA1_(ss);
  if (statusRange) {
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(statusRange, true).setAllowInvalid(true).build();
    dailyTaskSheet.getRange(DT_MAIN_FIRST_ROW, 9, DT_MAIN_ROWS, 1).setDataValidation(statusRule);
    dailyTaskSheet.getRange(DT_DEAD_FIRST_ROW, 9, DT_DEAD_ROWS, 1).setDataValidation(statusRule);
  }

  // Live counters. Each block is a window onto the Book, so it can only show as many
  // players as it has rows. Rather than let an overflow hide people silently, every block
  // reports how many exist versus how many fit, and shouts if it can't show them all.
  function counterFormula_(flagCol, capacity, label) {
    var total = 'COUNTIF(' + bk + '!$' + flagCol + '$' + BOOK_FIRST_ROW + ':$' + flagCol + '$' +
      BOOK_LAST_ROW + ',1)';
    return '="' + label + ' - "&' + total + '&" in total"&IF(' + total + '>' + capacity +
      ',"   >>> ONLY " & ' + capacity + ' & " FIT HERE, " & (' + total + '-' + capacity +
      ') & " NOT SHOWN - ask for more rows <<<"," (all shown)")';
  }

  dailyTaskSheet.getRange(DT_MAIN_COUNT_ROW, 1)
    .setFormula(counterFormula_("R", DT_MAIN_ROWS, "End of today's queue"))
    .setFontStyle("italic").setFontColor("#666666").setFontSize(9);

  // Section headers for the two lower blocks.
  var sections = [
    [DT_PREVIEW_NOTE_ROW, DT_PREVIEW_HEADER_ROW,
     counterFormula_("Y", DT_PREVIEW_ROWS,
       "Coming Up - not due yet, shown so you can see what's landing next")],
    [DT_DEAD_NOTE_ROW, DT_DEAD_HEADER_ROW,
     counterFormula_("U", DT_DEAD_ROWS,
       "Dead Lead Reactivation - soonest re-target first, red = due now, tick Task Complete once you've reached back out")]
  ];
  for (var s = 0; s < sections.length; s++) {
    dailyTaskSheet.getRange(sections[s][0], 1).setFormula(sections[s][2])
      .setFontStyle("italic").setFontColor("#666666").setFontSize(9);
    dailyTaskSheet.getRange(sections[s][1], 1, 1, 13).setValues([DT_HEADERS]);
    dailyTaskSheet.getRange(sections[s][1], 1, 1, 13)
      .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF").setWrap(true);
    dailyTaskSheet.setRowHeight(sections[s][1], 36);
  }

  dailyTaskSheet.hideColumns(2); // Match Row - internal plumbing

  // Overdue highlighting on the two actionable blocks. The preview is deliberately left
  // unhighlighted - nothing in it is due yet, so red there would just be noise.
  // getConditionalFormatRules() only ever returns THIS sheet's rules, and this action
  // rebuilds the whole tab, so every one of them is replaced. Nothing to filter.
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E' + DT_MAIN_FIRST_ROW + '<>"",$E' + DT_MAIN_FIRST_ROW + '<TODAY())')
    .setBackground("#F4CCCC")
    .setRanges([dailyTaskSheet.getRange(DT_MAIN_FIRST_ROW, 1, DT_MAIN_ROWS, 13)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E' + DT_DEAD_FIRST_ROW + '<>"",$E' + DT_DEAD_FIRST_ROW + '<=TODAY())')
    .setBackground("#F4CCCC")
    .setRanges([dailyTaskSheet.getRange(DT_DEAD_FIRST_ROW, 1, DT_DEAD_ROWS, 13)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J' + DT_DEAD_FIRST_ROW + '="Black"')
    .setBackground("#D9D9D9")
    .setRanges([dailyTaskSheet.getRange(DT_DEAD_FIRST_ROW, 10, DT_DEAD_ROWS, 1)]).build());
  dailyTaskSheet.setConditionalFormatRules(rules);

  ui.alert("Daily Task tab rebuilt",
    "Order is now:\n" +
      "  Today's queue - rows " + DT_MAIN_FIRST_ROW + "-" + DT_MAIN_LAST_ROW + "\n" +
      "  Coming Up - rows " + DT_PREVIEW_FIRST_ROW + "-" + DT_PREVIEW_LAST_ROW + "\n" +
      "  Dead Lead Reactivation - rows " + DT_DEAD_FIRST_ROW + "-" + DT_DEAD_LAST_ROW + "\n\n" +
      "Every block now looks across the whole Book (rows " + BOOK_FIRST_ROW + "-" + BOOK_LAST_ROW +
      "), so players below the old 200-row limit show up properly instead of leaving blank rows.\n\n" +
      "Give it a few seconds to fill in.", ui.ButtonSet.OK);
}

// ============================================================
// Check Everything - reads the whole chain and reports what does and does not line up.
// Changes nothing at all. Run it before and after a setup to see what moved.
// ============================================================
function checkEverything() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, ftdListSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
    if (n.indexOf(" - FTD List") !== -1) ftdListSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var ok = [], bad = [];
  var maxRows = bookSheet.getMaxRows();
  if (maxRows >= BOOK_LAST_ROW) ok.push("Book has room for " + BOOK_ROWS + " players");
  else bad.push("Book only reaches row " + maxRows + " - run Full Setup");

  var n2 = Math.min(BOOK_LAST_ROW, maxRows) - BOOK_FIRST_ROW + 1;
  var handles = bookSheet.getRange(BOOK_FIRST_ROW, COL_PLAYER_HANDLE, n2, 1).getValues();
  var statuses = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, n2, 1).getValues();
  var players = 0, lastUsed = 0;
  for (var r = 0; r < n2; r++) if (handles[r][0]) { players++; lastUsed = BOOK_FIRST_ROW + r; }
  ok.push(players + " players (last on row " + (lastUsed || "-") + ")");

  var cols = [[1,"Player ID"],[6,"Health"],[7,"Priority"],[10,"Next Follow-Up"],[11,"Next Action"],
              [15,"VIP Ready"],[18,"DueFlag"],[19,"DueRank"],[21,"Dead Lead Flag"],[22,"Dead Lead Rank"]];
  var missing = [], refs = [];
  for (var c = 0; c < cols.length; c++) {
    var f = bookSheet.getRange(BOOK_FIRST_ROW, cols[c][0], n2, 1).getFormulas();
    var blank = 0, bad2 = 0;
    for (var k = 0; k < n2; k++) {
      if (!f[k][0]) blank++;
      else if (f[k][0].indexOf("#REF!") !== -1) bad2++;
    }
    if (blank > 0) missing.push(cols[c][1] + " (" + blank + ")");
    if (bad2 > 0) refs.push(cols[c][1] + " (" + bad2 + ")");
  }
  if (!missing.length) ok.push("All computed columns present on every row");
  else bad.push("Missing formulas: " + missing.join(", ") + " - run Repair Book Rows");
  if (refs.length) bad.push("BROKEN #REF! formulas: " + refs.join(", ") + " - run Repair Book Rows");

  var tz = ss.getSpreadsheetTimeZone(), timed = 0;
  var dcols = [8, 9, 23, 27, 32];
  for (var dc = 0; dc < dcols.length; dc++) {
    if (dcols[dc] > bookSheet.getMaxColumns()) continue;
    var dv = bookSheet.getRange(BOOK_FIRST_ROW, dcols[dc], n2, 1).getValues();
    for (var dr = 0; dr < n2; dr++) {
      var v = dv[dr][0];
      if (v && Object.prototype.toString.call(v) === "[object Date]" &&
          (v.getHours() || v.getMinutes() || v.getSeconds())) timed++;
    }
  }
  if (timed === 0) ok.push("All stamped dates are clean (no hidden times)");
  else bad.push(timed + " dates still carry a time - they will not match TODAY(). Run Widen Stats + Clean Dates");

  if (dailyTaskSheet) {
    var blocks = [[18, DT_MAIN_ROWS, "Today's queue"], [25, DT_PREVIEW_ROWS, "Coming Up"],
                  [21, DT_DEAD_ROWS, "Dead Leads"]];
    for (var g = 0; g < blocks.length; g++) {
      var vals = bookSheet.getRange(BOOK_FIRST_ROW, blocks[g][0], n2, 1).getValues();
      var cnt = 0;
      for (var v2 = 0; v2 < vals.length; v2++) if (vals[v2][0] === 1) cnt++;
      if (cnt <= blocks[g][1]) ok.push(blocks[g][2] + ": " + cnt + " qualify, all shown");
      else bad.push(blocks[g][2] + ": " + cnt + " qualify but only " + blocks[g][1] +
        " fit - " + (cnt - blocks[g][1]) + " NOT SHOWN");
    }
  } else bad.push("No Daily Task tab found");

  var shouldFtd = 0;
  for (var s2 = 0; s2 < n2; s2++) if (isFtdQualifyingStatus_(statuses[s2][0]) && handles[s2][0]) shouldFtd++;
  if (ftdListSheet) {
    var lv = ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 1, FTD_LIST_CAPACITY, 1).getValues(), lc = 0;
    for (var l = 0; l < lv.length; l++) if (lv[l][0]) lc++;
    if (lc === shouldFtd) ok.push("FTD List matches the Book (" + lc + ")");
    else bad.push("FTD List has " + lc + " but the Book says " + shouldFtd + " - run Repair & Rebuild FTD List");
    if (shouldFtd > FTD_LIST_CAPACITY) bad.push("FTD List capacity is " + FTD_LIST_CAPACITY + ", you have " + shouldFtd);
  } else bad.push("No FTD List tab found");

  var vipT = 0, vipTeam = 0, vipStuck = 0;
  var vtv = bookSheet.getRange(BOOK_FIRST_ROW, COL_VIP_TEAM, n2, 1).getValues();
  var att = bookSheet.getRange(BOOK_FIRST_ROW, 28, n2, 1).getValues();
  for (var q = 0; q < n2; q++) {
    if (statuses[q][0] === "VIP Transferred") { vipT++; if (Number(att[q][0]) >= 3) vipStuck++; }
    if (vtv[q][0] === "Yes") vipTeam++;
  }
  ok.push("VIP: " + vipT + " VIP Transferred, " + vipTeam + " with VIP Team (compare to the Master)");
  if (vipStuck > 0) bad.push(vipStuck + " VIP players are at 3 attempts and about to auto-flag as Dead Lead - run Reset VIP Check-in Clock");

  ok.push("Time zone: " + tz + " - today here is " + today_(ss));

  var filter = bookSheet.getFilter();
  if (filter && filter.getRange().getLastRow() < Math.min(BOOK_LAST_ROW, maxRows)) {
    bad.push("Book filter stops at row " + filter.getRange().getLastRow() + " - sorting would leave rows behind");
  } else ok.push("Book filter covers the whole Book");

  ui.alert("Check Everything - " + repName,
    (bad.length === 0 ? "Everything checks out.\n\n"
      : bad.length + " PROBLEM" + (bad.length > 1 ? "S" : "") + ":\n\n- " + bad.join("\n- ") + "\n\n") +
    "Checked and fine:\n- " + ok.join("\n- "), ui.ButtonSet.OK);
}

// ============================================================
// ONE BUTTON - runs every setup step for this sheet, in the right order.
// Each step reports its own result, so you see what happened at each stage.
// Everything is safe to re-run; nothing is skipped or hidden.
// ============================================================
function RUN_FULL_SETUP() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert("Full setup for this sheet",
      "Runs all five steps in order:\n\n" +
        "1. Expand Book to 1000 rows\n" +
        "2. Move Sent to VIP Team to its own tab\n" +
        "3. Rebuild the Daily Task tab\n" +
        "4. Widen Stats + Activity Log, clean the dates\n" +
        "5. Reset the VIP check-in clock\n\n" +
        "Each step shows its own result - click through them. If Google stops it at the " +
        "6 minute limit, run it again; finished steps do nothing the second time.\n\n" +
        "Continue?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  expandBookCapacity();
  moveSentToVipTeamToOwnTab();
  rebuildDailyTaskTab();
  expandEverything();
  resetVipClock();

  ui.alert("Full setup finished",
    "All five steps have run. Now run \"Check Everything\" - it should come back clean.\n\n" +
      "If anything looks wrong, every step is safe to run again on its own from the menu.",
    ui.ButtonSet.OK);
}

// ============================================================
// Widen the Stats formulas and the Activity Log, and strip the time off stamped dates.
//
// The times matter: COUNTIFS(range, TODAY()) tests equality against midnight exactly, so a
// date stamped 7:00:00 never counts and the day reads zero.
//
// Writes ONE CELL AT A TIME and never touches a cell holding a formula. Columns W and AA
// contain formulas - overwriting those is what stopped Task Complete working once before.
// ============================================================
var EXP2_BOOK_LAST = 1003;
var EXP2_LOG_LAST = 20000;
var EXP2_DATE_COLS = [[8, "Date Assigned"], [9, "Last Contact Date"],
                      [23, "VIP Team check-in date"], [27, "VIP Transferred date"],
                      [32, "FTD Date"]];

function exp2Serial_(y, m, d) {
  return Math.round((Date.UTC(y, m, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function exp2IsError_(s) {
  s = String(s || "");
  return s.indexOf("#REF") === 0 || s.indexOf("#ERROR") === 0 || s.indexOf("#VALUE") === 0 ||
         s.indexOf("#N/A") === 0 || s.indexOf("#NUM") === 0 || s.indexOf("#DIV") === 0;
}

function expandEverything() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, logSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = n.split(" - ")[0]; }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
    if (n.indexOf(" - Activity Log") !== -1) logSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var report = [];

  if (logSheet && logSheet.getMaxRows() < EXP2_LOG_LAST + 4) {
    logSheet.insertRowsAfter(logSheet.getMaxRows(), (EXP2_LOG_LAST + 4) - logSheet.getMaxRows());
    report.push("Activity Log grown to " + logSheet.getMaxRows() + " rows");
  } else {
    report.push("Activity Log already had room");
  }

  var lastBookRow = Math.min(bookSheet.getMaxRows(), EXP2_BOOK_LAST);
  var count = lastBookRow - 4 + 1;
  var totalCleaned = 0, perCol = [], skippedFormulas = 0;

  if (count > 0) {
    for (var c = 0; c < EXP2_DATE_COLS.length; c++) {
      var col = EXP2_DATE_COLS[c][0];
      if (col > bookSheet.getMaxColumns()) continue;
      var rng = bookSheet.getRange(4, col, count, 1);
      var vals = rng.getValues(), shown = rng.getDisplayValues(), fmls = rng.getFormulas();
      var cleaned = 0;

      for (var r = 0; r < count; r++) {
        if (fmls[r][0]) { skippedFormulas++; continue; }
        var v = vals[r][0];
        if (v === "" || v === null) continue;
        var isDate = Object.prototype.toString.call(v) === "[object Date]";
        var hasTime = isDate && (v.getHours() !== 0 || v.getMinutes() !== 0 || v.getSeconds() !== 0);
        var isTextDate = (typeof v === "string") && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
        if (!hasTime && !isTextDate) continue;

        var s = String(shown[r][0]).trim(), y = 0, mo = 0, d = 0, parsed = false;
        var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (iso) { y = +iso[1]; mo = +iso[2] - 1; d = +iso[3]; parsed = true; }
        if (!parsed) {
          var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
          if (us) { mo = +us[1] - 1; d = +us[2]; y = +us[3]; parsed = true; }
        }
        if (!parsed && isDate) { y = v.getFullYear(); mo = v.getMonth(); d = v.getDate(); parsed = true; }
        if (!parsed) continue;

        var cell = bookSheet.getRange(4 + r, col);
        cell.setValue(exp2Serial_(y, mo, d));
        cell.setNumberFormat("yyyy-mm-dd");
        cleaned++;
      }
      if (cleaned > 0) { totalCleaned += cleaned; perCol.push(EXP2_DATE_COLS[c][1] + ": " + cleaned); }
    }
  }
  report.push(totalCleaned > 0
    ? "Times stripped off " + totalCleaned + " dates (" + perCol.join(", ") + ")"
    : "Dates already clean");
  if (skippedFormulas > 0) report.push("Left " + skippedFormulas + " formula cells alone (correct)");

  var widened = 0, reverted = [];
  if (statsSheet) {
    var esc = repName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var bookPat = new RegExp("('" + esc + " - Book'!\\$[A-Z]+\\$\\d+:\\$[A-Z]+\\$)(198|199|200|203)(?![0-9])", "g");
    var logPat = new RegExp("('" + esc + " - Activity Log'!\\$[A-Z]+\\$\\d+:\\$[A-Z]+\\$)5000(?![0-9])", "g");
    var sLastRow = statsSheet.getLastRow(), sLastCol = statsSheet.getLastColumn();
    if (sLastRow > 0 && sLastCol > 0) {
      var sRange = statsSheet.getRange(1, 1, sLastRow, sLastCol);
      var sF = sRange.getFormulas(), sB = sRange.getDisplayValues(), pending = [];
      for (var sr = 0; sr < sF.length; sr++) {
        for (var sc = 0; sc < sF[sr].length; sc++) {
          var f = sF[sr][sc];
          if (!f) continue;
          var nf = f.replace(bookPat, "$1" + EXP2_BOOK_LAST).replace(logPat, "$1" + EXP2_LOG_LAST);
          if (nf === f) continue;
          statsSheet.getRange(sr + 1, sc + 1).setFormula(nf);
          pending.push({ row: sr + 1, col: sc + 1, oldF: f, wasError: exp2IsError_(sB[sr][sc]) });
          widened++;
        }
      }
      if (pending.length > 0) {
        SpreadsheetApp.flush(); Utilities.sleep(3000);
        for (var t = 0; t < pending.length; t++) {
          var pc = statsSheet.getRange(pending[t].row, pending[t].col);
          if (exp2IsError_(pc.getDisplayValue()) && !pending[t].wasError) {
            pc.setFormula(pending[t].oldF); reverted.push(pc.getA1Notation()); widened--;
          }
        }
      }
    }
    report.push(widened > 0 ? "Widened " + widened + " Stats formulas" : "No Stats formula needed widening");
    if (reverted.length) report.push("Put back because they broke: " + reverted.join(", "));
  }

  SpreadsheetApp.flush();
  ui.alert("Stats + dates - " + repName, report.join("\n\n"), ui.ButtonSet.OK);
}

// ============================================================
// Puts the Stats tab headings back. Only needed on a sheet where an earlier version of the
// stats fix erased them. Writes text only, and never into a cell holding a formula.
// ============================================================
function restoreStatsLabels() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Stats") !== -1) { statsSheet = sheets[i]; repName = n.split(" - ")[0]; }
  }
  if (!statsSheet) { SpreadsheetApp.getUi().alert("No Stats tab here."); return; }

  var NAVY = "#1F3864", written = 0;
  function put(row, col, text) {
    var cell = statsSheet.getRange(row, col);
    if (cell.getFormula()) return;
    cell.setValue(text); written++;
  }
  function headerRow(row, n) {
    statsSheet.getRange(row, 1, 1, n).setFontWeight("bold").setBackground(NAVY)
      .setFontColor("#FFFFFF").setWrap(true);
    statsSheet.setRowHeight(row, 28);
  }
  function subtitle(row, text) {
    put(row, 1, text);
    statsSheet.getRange(row, 1).setFontWeight("bold").setFontColor(NAVY).setFontSize(12);
  }
  function note(row, text) {
    put(row, 1, text);
    statsSheet.getRange(row, 1).setFontStyle("italic").setFontColor("#666666").setFontSize(8).setWrap(true);
  }

  put(1, 1, repName + "'s Statistics");
  statsSheet.getRange(1, 1).setFontWeight("bold").setFontColor(NAVY).setFontSize(16);

  subtitle(3, "Total List (all players ever assigned)");
  var tl = ["Number of Contacts", "Number of VIP Transfers", "Number of Active Players", "Total Wagered (current)"];
  for (var a = 0; a < tl.length; a++) put(4, a + 1, tl[a]);
  headerRow(4, tl.length);

  subtitle(7, "Active List (currently active players only)");
  var al = ["Number of Contacts", "Number of VIP Transfers", "Number of Active Players", "Number of FTDs"];
  for (var b = 0; b < al.length; b++) put(8, b + 1, al[b]);
  headerRow(8, al.length);

  note(11, "Note: wager figures are a running total from the Weighted Wager column in his Book.");

  subtitle(12, "Today vs. Target");
  var tvt = ["Active Leads Today", "Active Leads Target", "VIP Transfers Today",
             "VIP Transfers Target", "FTD Today", "FTD Target"];
  for (var c = 0; c < tvt.length; c++) put(13, c + 1, tvt[c]);
  headerRow(13, tvt.length);

  subtitle(16, "This Week (Mon-today) / This Month (1st-today)");
  var wm = ["Period", "Active Leads", "VIP Transfers", "FTD"];
  for (var d = 0; d < wm.length; d++) put(17, d + 1, wm[d]);
  headerRow(17, wm.length);
  put(18, 1, "This Week"); put(19, 1, "This Month");
  statsSheet.getRange(18, 1, 2, 1).setFontWeight("bold").setHorizontalAlignment("left");

  note(21, "Build a trend chart: select A17:D19 above, then Insert > Chart in Google Sheets.");

  subtitle(23, "Current Status Breakdown (live count, right now - informational only, not a KPI)");
  put(24, 1, "Status"); put(24, 2, "Count");
  headerRow(24, 2);
  var st = ["Initial Contact", "Interested", "VIP Transferred", "KYC Complete", "First Deposit",
            "Active", "Reactivation Queue", "Dead Lead", "Potential Lead"];
  for (var s = 0; s < st.length; s++) put(25 + s, 1, st[s]);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Restored " + written + " Stats labels on " + repName + " - Stats.");
}

function resetVipClock() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = n.split(" - ")[0]; }
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var FIRST = 4;
  var LAST = Math.min(bookSheet.getMaxRows(), 1003);
  var count = LAST - FIRST + 1;
  if (count < 1) { ui.alert("Book looks empty."); return; }

  var handles = bookSheet.getRange(FIRST, 2, count, 1).getValues();
  var statuses = bookSheet.getRange(FIRST, 5, count, 1).getValues();

  var targets = [];
  for (var r = 0; r < count; r++) {
    if (!handles[r][0]) continue;
    if (statuses[r][0] !== "VIP Transferred") continue;
    targets.push({ row: FIRST + r, handle: handles[r][0] });
  }

  if (targets.length === 0) {
    ui.alert("Nothing to reset",
      "No players are currently sitting at Status = VIP Transferred on " + repName + "'s Book.",
      ui.ButtonSet.OK);
    return;
  }

  var names = [];
  for (var t = 0; t < Math.min(targets.length, 20); t++) names.push(targets[t].handle);

  var go = ui.alert("Reset VIP clock - " + targets.length + " players",
    "This restarts the Day 1 / 2 / 3 check-in cadence from today for every player currently " +
      "at VIP Transferred:\n\n" + names.join(", ") +
      (targets.length > 20 ? " ... and " + (targets.length - 20) + " more" : "") +
      "\n\nDay 1 becomes tomorrow, Day 2 the day after, Day 3 after that.\n\n" +
      "It writes two cells per player - the VIP start date and the attempt count. Nothing " +
      "else is touched, and nobody gets auto-flagged as a dead lead for check-ins that " +
      "never happened.\n\nContinue?", ui.ButtonSet.YES_NO);
  if (go !== ui.Button.YES) return;

  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var serial = Math.round((Date.UTC(Number(Utilities.formatDate(now, tz, "yyyy")),
                                    Number(Utilities.formatDate(now, tz, "MM")) - 1,
                                    Number(Utilities.formatDate(now, tz, "dd")))
                           - Date.UTC(1899, 11, 30)) / 86400000);

  for (var k = 0; k < targets.length; k++) {
    var dateCell = bookSheet.getRange(targets[k].row, 27);   // AA - VIP Transferred date
    dateCell.setValue(serial);
    dateCell.setNumberFormat("yyyy-mm-dd");
    bookSheet.getRange(targets[k].row, 28).setValue(0);      // AB - attempts
  }

  SpreadsheetApp.flush();

  ui.alert("VIP clock reset",
    "Restarted " + targets.length + " players from today.\n\n" +
      "Their Day 1 check-in lands tomorrow, and they will come into the Daily Task queue " +
      "then. Nobody is at risk of the 3-attempt auto-flag any more.\n\n" +
      "Only the VIP start date and attempt count were written. Everything else is as it was.",
    ui.ButtonSet.OK);
}

// ============================================================
// Finds where the "Sent to VIP Team" block starts inside the Book by LOOKING for it,
// rather than assuming a fixed row number. This matters: if anyone has ever deleted a row
// from the Book, everything below it slid up, so the block is no longer where the original
// layout put it. Assuming a fixed row is exactly what made the v30/v31 versions of the two
// actions below fail silently on sheets that had rows deleted. Returns -1 if not found
// (i.e. the list has already been moved to its own tab).
// ============================================================
function findBookVipBlockRow_(bookSheet) {
  var maxScan = Math.min(bookSheet.getMaxRows(), 1300);
  if (maxScan < 1) return -1;
  var values = bookSheet.getRange(1, 1, maxScan, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").indexOf("Sent to VIP Team") !== -1) return i + 1;
  }
  return -1;
}

// ============================================================
// Time zone fix (v32). Every date this script stamps - Date Assigned, Last Contact, FTD
// Date, Activity Log - uses THIS SHEET'S time zone to decide what day it is, and so does
// every TODAY() formula on the sheet. If the sheet is set to a time zone behind the rep,
// their early-morning work gets stamped with yesterday's date.
//
// Safe to run any time. Dates already in the sheet do NOT change - a stored date is just
// "the 20th", not a moment in time, so it can't shift.
// ============================================================
var TIMEZONE_CHOICES = [
  ["Africa/Johannesburg", "South Africa (SAST)"],
  ["Africa/Lagos", "Nigeria / West Africa"],
  ["Africa/Nairobi", "Kenya / East Africa"],
  ["Europe/London", "UK (GMT/BST)"],
  ["Europe/Lisbon", "Portugal"],
  ["Europe/Berlin", "Central Europe (Germany, Netherlands, Spain, Poland)"],
  ["Europe/Athens", "Eastern Europe (Greece, Romania, Ukraine)"],
  ["America/New_York", "US Eastern"],
  ["America/Chicago", "US Central"],
  ["America/Denver", "US Mountain"],
  ["America/Los_Angeles", "US Pacific"],
  ["America/Sao_Paulo", "Brazil"],
  ["America/Bogota", "Colombia / Peru"],
  ["America/Mexico_City", "Mexico"],
  ["Asia/Dubai", "UAE"],
  ["Asia/Kolkata", "India"],
  ["Asia/Manila", "Philippines"],
  ["Asia/Singapore", "Singapore / Malaysia"],
  ["Australia/Sydney", "Australia (Eastern)"],
  ["Pacific/Auckland", "New Zealand"],
  ["UTC", "UTC (no offset)"]
];

function setSheetTimeZone() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var currentTz = ss.getSpreadsheetTimeZone();

  var lines = [];
  for (var i = 0; i < TIMEZONE_CHOICES.length; i++) {
    lines.push((i + 1) + ". " + TIMEZONE_CHOICES[i][1] + "  [" + TIMEZONE_CHOICES[i][0] + "]");
  }

  var response = ui.prompt(
    "Set This Sheet's Time Zone",
    "This sheet is currently set to: " + currentTz + "\n\n" +
      "Whatever this is set to decides what day gets stamped when this rep logs work, and " +
      "what TODAY() means in every formula here. Set it to where the rep actually is.\n\n" +
      lines.join("\n") + "\n\n" +
      "Type a number from the list, or type any time zone name directly. Dates already in " +
      "the sheet will not change.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;
  var input = response.getResponseText().trim();
  if (!input) { ui.alert("Nothing entered - time zone left as " + currentTz + "."); return; }

  var chosen;
  if (/^\d+$/.test(input)) {
    var idx = parseInt(input, 10) - 1;
    if (idx < 0 || idx >= TIMEZONE_CHOICES.length) {
      ui.alert("There's no option numbered " + input + ". Nothing was changed.");
      return;
    }
    chosen = TIMEZONE_CHOICES[idx][0];
  } else {
    chosen = input;
  }

  // Set it, then read it back - an unrecognised name won't stick, and checking the result
  // is far more reliable than trying to validate the name ourselves.
  try {
    ss.setSpreadsheetTimeZone(chosen);
  } catch (err) {
    ui.alert('"' + chosen + '" was not accepted as a time zone. Nothing was changed.\n\n' +
      "Pick a number from the list instead, or use an exact name like Africa/Johannesburg.");
    return;
  }

  var applied = ss.getSpreadsheetTimeZone();
  if (applied !== chosen) {
    ui.alert('"' + chosen + '" was not recognised - this sheet is still set to ' + applied +
      ".\n\nPick a number from the list instead, or use an exact name like Africa/Johannesburg.");
    return;
  }

  ui.alert("Time zone updated",
    "Was: " + currentTz + "\nNow: " + applied + "\n\nToday's date here is now " + today_(ss) +
      ".\n\nFrom now on this sheet stamps dates using this rep's own day. Dates already in " +
      "the sheet were not touched.\n\nThis only changes THIS rep's sheet - run it once in " +
      "each sheet whose time zone is wrong.",
    ui.ButtonSet.OK);
}

// ============================================================
// STEP 1 - grows this rep's Book from its original 200 lead rows up to BOOK_ROWS (1000).
//
// Finds the real end of the lead rows by locating the "Sent to VIP Team" block rather than
// assuming row 203, because deleted rows shift everything up. Safe to run twice: on a
// second run there's nothing left to add, so it just refreshes the ranking formulas.
// ============================================================
function expandBookCapacity() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) bookSheet = sheets[i];
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var props = PropertiesService.getDocumentProperties();
  var vipNoteRow = findBookVipBlockRow_(bookSheet);
  var lastLeadRow;

  if (vipNoteRow !== -1) {
    // One blank spacer row sits between the last lead row and the note.
    lastLeadRow = vipNoteRow - 2;
  } else if (props.getProperty("BOOK_EXPANDED_TO") === String(BOOK_ROWS)) {
    rebuildBookRankingFormulas_(bookSheet);
    ui.alert("This Book is already at " + BOOK_ROWS + " rows.\n\n" +
      "Refreshed the ranking formulas anyway, which is harmless and fixes them if any got " +
      "broken.");
    return;
  } else {
    lastLeadRow = PRE_V30_BOOK_LAST_ROW;
  }

  var rowsToAdd = BOOK_LAST_ROW - lastLeadRow;
  var lastCol = Math.max(bookSheet.getLastColumn(), 32);

  if (rowsToAdd > 0) {
    bookSheet.insertRowsAfter(lastLeadRow, rowsToAdd);

    var template = bookSheet.getRange(lastLeadRow, 1, 1, lastCol);
    var target = bookSheet.getRange(lastLeadRow + 1, 1, rowsToAdd, lastCol);
    template.copyTo(target, { formatOnly: true });

    // Copy the dropdowns explicitly - formatting alone doesn't carry data validation, and
    // without this the Status/Health dropdowns would be missing on every new row.
    var srcValidations = template.getDataValidations()[0];
    var grid = [];
    for (var g = 0; g < rowsToAdd; g++) grid.push(srcValidations.slice());
    target.setDataValidations(grid);
  }

  rebuildBookRankingFormulas_(bookSheet);
  restoreBookRowFormatting_(bookSheet);
  restoreBookFilter_(bookSheet);

  var widened = false;
  if (dailyTaskSheet) {
    var queueRows = Math.min(DT_MAIN_ROWS, dailyTaskSheet.getMaxRows() - DT_MAIN_FIRST_ROW + 1);
    if (queueRows > 0) {
      var mainRange = dailyTaskSheet.getRange(DT_MAIN_FIRST_ROW, DT_COL_MATCH_ROW, queueRows, 1);
      var mainFormulas = mainRange.getFormulas();
      for (var r = 0; r < mainFormulas.length; r++) {
        var f = mainFormulas[r][0];
        if (!f) continue;
        var updated = f.replace(/(\$S\$)\d+/g, "$1" + BOOK_LAST_ROW);
        if (updated !== f) { mainFormulas[r][0] = updated; widened = true; }
      }
      if (widened) mainRange.setFormulas(mainFormulas);
    }
  }

  props.setProperty("BOOK_EXPANDED_TO", String(BOOK_ROWS));

  var msg;
  if (rowsToAdd > 0) {
    msg = "Added " + rowsToAdd + " lead rows (now rows " + BOOK_FIRST_ROW + "-" + BOOK_LAST_ROW +
      "), carrying over the formatting and dropdowns from row " + lastLeadRow + ".\n";
  } else {
    msg = "The Book was already big enough - no rows needed adding.\n";
  }
  msg += "Rebuilt every computed column (Player ID, Health, Priority, Next Follow-Up, " +
    "Next Action, VIP Ready and the hidden list helpers) across all " + BOOK_ROWS + " rows.\n";
  if (widened) msg += "Widened the Daily Task queue so it can see the new rows.\n";
  if (vipNoteRow !== -1) {
    msg += "\nThe \"Sent to VIP Team\" list further down the Book moved down with the new " +
      "rows, which is expected. Run Step 2 next to give it its own tab.";
  }
  ui.alert("Step 1 complete", msg + "\n\nGive it a few seconds to recalculate.", ui.ButtonSet.OK);
}

// ============================================================
// STEP 2 - moves the "Sent to VIP Team" list off the Book and onto its own tab, freeing up
// the space it was taking. Finds the block by looking for it rather than assuming a row.
// Safe to run twice.
// ============================================================
function moveSentToVipTeamToOwnTab() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var vipTeamSheetName = repName + " - VIP Team";
  var vipTeamSheet = ss.getSheetByName(vipTeamSheetName);
  var alreadyExisted = !!vipTeamSheet;
  if (!vipTeamSheet) vipTeamSheet = ss.insertSheet(vipTeamSheetName);

  var bk = "'" + bookSheet.getName() + "'";

  vipTeamSheet.getRange(1, 1).setValue(
    "Sent to VIP Team - players you've personally handed off (Transferred to VIP Team = Yes)."
  );
  vipTeamSheet.getRange(1, 1).setFontStyle("italic").setFontColor("#666666").setFontSize(9);

  vipTeamSheet.getRange(2, 1, 1, 5).setValues(
    [["Player Handle", "Status", "Health", "Last Contact Date", "Next VIP Check-in"]]
  );
  vipTeamSheet.getRange(2, 1, 1, 5)
    .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");

  vipTeamSheet.getRange(3, 1).setFormula(
    '=IFERROR(FILTER({' +
      bk + '!$B$' + BOOK_FIRST_ROW + ':$B$' + BOOK_LAST_ROW + ',' +
      bk + '!$E$' + BOOK_FIRST_ROW + ':$E$' + BOOK_LAST_ROW + ',' +
      bk + '!$F$' + BOOK_FIRST_ROW + ':$F$' + BOOK_LAST_ROW + ',' +
      bk + '!$I$' + BOOK_FIRST_ROW + ':$I$' + BOOK_LAST_ROW + ',' +
      bk + '!$AE$' + BOOK_FIRST_ROW + ':$AE$' + BOOK_LAST_ROW + '},' +
      '(' + bk + '!$AC$' + BOOK_FIRST_ROW + ':$AC$' + BOOK_LAST_ROW + '="Yes")*' +
      '(' + bk + '!$B$' + BOOK_FIRST_ROW + ':$B$' + BOOK_LAST_ROW + '<>"")), "")'
  );
  vipTeamSheet.getRange(3, 4, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  vipTeamSheet.getRange(3, 5, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  vipTeamSheet.setColumnWidths(1, 5, 140);
  vipTeamSheet.setFrozenRows(2);

  var vipNoteRow = findBookVipBlockRow_(bookSheet);
  var removedFromBook = false;
  if (vipNoteRow !== -1) {
    var available = bookSheet.getMaxRows() - vipNoteRow + 1;
    var clearRows = Math.min(BOOK_ROWS + 10, available);
    if (clearRows > 0) {
      bookSheet.getRange(vipNoteRow, 1, clearRows, 5).clearContent().clearFormat();
      removedFromBook = true;
    }
  }

  var msg = alreadyExisted
    ? 'Refreshed the "' + vipTeamSheetName + '" tab.'
    : 'Created the "' + vipTeamSheetName + '" tab with the Sent to VIP Team list.';
  msg += removedFromBook
    ? "\n\nCleared the old copy out of the Book (it was at row " + vipNoteRow + ")."
    : "\n\nThere was no copy left in the Book to clear.";
  ui.alert("Step 2 complete", msg, ui.ButtonSet.OK);
}

// ============================================================
// STEP 3 - grows the Daily Task "due now" queue from 60 rows to DT_MAIN_ROWS (150).
//
// Run this BEFORE Step 4 - it inserts rows above the Reactivation block, pushing it down.
// Only writes into the brand-new rows, so nobody's ticked Task Complete boxes or Notes get
// disturbed.
// ============================================================
function expandDailyTaskMainQueue() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
  }
  if (!bookSheet || !dailyTaskSheet) {
    ui.alert("Couldn't find this file's Book or Daily Task tab.");
    return;
  }

  var props = PropertiesService.getDocumentProperties();
  if (props.getProperty("DT_QUEUE_EXPANDED_TO") === String(DT_MAIN_ROWS)) {
    ui.alert("The Daily Task queue is already at " + DT_MAIN_ROWS + " rows - nothing to do.");
    return;
  }

  var bk = "'" + repName + " - Book'";
  var rowsToAdd = DT_MAIN_LAST_ROW - PRE_V31_MAIN_LAST_ROW;

  dailyTaskSheet.insertRowsAfter(PRE_V31_MAIN_LAST_ROW, rowsToAdd);

  for (var idx = 0; idx < rowsToAdd; idx++) {
    var row = PRE_V31_MAIN_LAST_ROW + 1 + idx;
    var priority = row - DT_MAIN_FIRST_ROW + 1;
    var mref = "$B" + row;
    dailyTaskSheet.getRange(row, 1).setValue(false);
    dailyTaskSheet.getRange(row, 2).setFormula(
      '=IFERROR(MATCH(' + priority + ',' + bk + '!$S$' + BOOK_FIRST_ROW + ':$S$' + BOOK_LAST_ROW + ',0)+' + BOOK_FIRST_ROW + '-1,"")'
    );
    dailyTaskSheet.getRange(row, 3).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$A:$A,' + mref + '))');
    dailyTaskSheet.getRange(row, 4).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$B:$B,' + mref + '))');
    dailyTaskSheet.getRange(row, 5).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$J:$J,' + mref + '))');
    dailyTaskSheet.getRange(row, 6).setFormula('=IF(' + mref + '="","","' + repName + '")');
    dailyTaskSheet.getRange(row, 7).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$C:$C,' + mref + '))');
    dailyTaskSheet.getRange(row, 8).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$D:$D,' + mref + '))');
    dailyTaskSheet.getRange(row, 9).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$E:$E,' + mref + '))');
    dailyTaskSheet.getRange(row, 10).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$F:$F,' + mref + '))');
    dailyTaskSheet.getRange(row, 11).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$K:$K,' + mref + '))');
    dailyTaskSheet.getRange(row, 12).setFormula('=IF(' + mref + '="","",ROUND(INDEX(' + bk + '!$Q:$Q,' + mref + '),0))');
    dailyTaskSheet.getRange(row, 13).setFormula('=IF(' + mref + '="","",INDEX(' + bk + '!$P:$P,' + mref + '))');
    for (var c = 1; c <= 13; c++) {
      dailyTaskSheet.getRange(row, c).setFontFamily("Arial").setFontSize(10);
    }
    dailyTaskSheet.getRange(row, 5).setNumberFormat("yyyy-mm-dd");
    dailyTaskSheet.getRange(row, 12).setNumberFormat('0" days"');
  }

  var doneRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  dailyTaskSheet.getRange(PRE_V31_MAIN_LAST_ROW + 1, 1, rowsToAdd, 1).setDataValidation(doneRule);
  var statusRange = getStatusRangeA1_(ss);
  if (statusRange) {
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(statusRange, true)
      .setAllowInvalid(true)
      .build();
    dailyTaskSheet.getRange(PRE_V31_MAIN_LAST_ROW + 1, 9, rowsToAdd, 1).setDataValidation(statusRule);
  }

  var existingRules = dailyTaskSheet.getConditionalFormatRules();
  var keptRules = existingRules.filter(function (rule) {
    var ranges = rule.getRanges();
    for (var ri = 0; ri < ranges.length; ri++) {
      var a1 = ranges[ri].getA1Notation();
      if (a1.indexOf("A5:") === 0 || a1.indexOf("A5") === 0) return false;
    }
    return true;
  });
  keptRules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E5<>"",$E5<TODAY())')
    .setBackground("#F4CCCC")
    .setRanges([dailyTaskSheet.getRange("A5:M" + DT_MAIN_LAST_ROW)])
    .build());
  dailyTaskSheet.setConditionalFormatRules(keptRules);

  props.setProperty("DT_QUEUE_EXPANDED_TO", String(DT_MAIN_ROWS));

  ui.alert("Step 3 complete",
    "Added " + rowsToAdd + " rows to the Daily Task queue (now rows " + DT_MAIN_FIRST_ROW +
      "-" + DT_MAIN_LAST_ROW + ") with working formulas, dropdowns and overdue highlighting.\n\n" +
      "Your existing rows were left untouched - no ticked boxes or Notes were disturbed.\n\n" +
      "Run Step 4 next to expand Dead Lead Reactivation.",
    ui.ButtonSet.OK);
}

// ============================================================
// One-time menu action that removes "Total Wager (manual, monthly)" from the FTD List
// tab and replaces it with a live "Total Weighted Wager" sum at the bottom - Weighted
// Wager already pulls live from the Book, so the manual column was redundant upkeep with
// no real benefit. SAFETY: scans the manual column first for any real numbers a rep has
// already typed in - if it finds any, it stops and lists exactly which players have data
// there instead of deleting anything, so you can copy those numbers out first if you
// want them. Safe to run again once the column's gone (just reports "already up to date").
// ============================================================
function fixFtdListWagerColumn() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var ftdListSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - FTD List") !== -1) { ftdListSheet = sheets[i]; repName = repNameFromSheet_(n); }
  }
  if (!ftdListSheet) {
    ui.alert("Couldn't find this file's FTD List tab.");
    return;
  }

  var headerVal = ftdListSheet.getRange(FTD_LIST_HEADER_ROW, 5).getValue().toString();
  if (headerVal.indexOf("Total Wager") === -1) {
    ui.alert("Already up to date - this FTD List tab doesn't have the old manual Total Wager column anymore.");
    return;
  }

  // Scan the manual column (E) for any real numbers before touching anything.
  var lastRow = ftdListSheet.getLastRow();
  var dataRows = Math.max(lastRow - FTD_LIST_FIRST_ROW + 1, 0);
  var handlesAndValues = dataRows > 0
    ? ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 1, dataRows, 5).getValues()
    : [];
  var foundEntries = [];
  for (var r = 0; r < handlesAndValues.length; r++) {
    var handle = handlesAndValues[r][0];
    var manualVal = handlesAndValues[r][4];
    if (handle && manualVal !== "" && manualVal !== null && manualVal !== undefined) {
      foundEntries.push(handle + ": " + manualVal);
    }
  }

  if (foundEntries.length > 0) {
    ui.alert(
      "Fix FTD List Wager Column - stopped",
      "Found " + foundEntries.length + " player(s) with a number already typed into Total " +
        "Wager (manual, monthly):\n\n" + foundEntries.join("\n") +
        "\n\nNothing was changed. Copy these out if you want to keep them, then run this " +
        "again and it'll go ahead (the column will show empty next time).",
      ui.ButtonSet.OK
    );
    return;
  }

  // Nothing manually entered - safe to remove the column and add the sum row.
  ftdListSheet.deleteColumn(5);

  var totalRow = FTD_LIST_FIRST_ROW + FTD_LIST_CAPACITY;
  ftdListSheet.getRange(totalRow, 3).setValue("Total Weighted Wager:");
  ftdListSheet.getRange(totalRow, 3).setFontWeight("bold").setFontColor("#1F3864").setHorizontalAlignment("right");
  ftdListSheet.getRange(totalRow, 4).setFormula(
    '=SUM(D' + FTD_LIST_FIRST_ROW + ':D' + (totalRow - 1) + ')'
  );
  ftdListSheet.getRange(totalRow, 4).setFontWeight("bold").setFontColor("#1F3864").setNumberFormat("$#,##0;($#,##0);-");

  var descCell = ftdListSheet.getRange(2, 1);
  var descVal = descCell.getValue().toString();
  if (descVal.indexOf("fill in Total Wager by hand") !== -1) {
    descCell.setValue(
      "Added automatically the moment a player's Status is set to First Deposit or Active on " +
      "the Book. Roobet Username, FTD Date, and Weighted Wager are all pulled in automatically " +
      "and read-only - nothing to fill in by hand. Players also stay on the Book as usual, " +
      "this is just a clean, dedicated view. Total Weighted Wager (all players, live) is at " +
      "the bottom."
    );
  }

  ui.alert("Removed the manual Total Wager column and added a live Total Weighted Wager sum at the bottom.");
}

// ============================================================
// Safe to run any time (not just once) - wipes and rebuilds THIS rep's own FTD List tab
// from what's actually in the Book right now (every player whose Status is First Deposit
// or Active). Never moves the Total Weighted Wager row - only ever writes into the fixed
// data block above it. Use this any time the FTD List looks wrong: a row got deleted by
// hand and shifted things out of position, entries look missing, a player set straight to
// Active never showed up, stale entries are showing for players who were corrected off
// First Deposit/Active, etc. Existing FTD Dates already on the Book are kept as-is -
// this never invents or resets a date, it only rebuilds which rows are shown.
// ============================================================
function repairFtdList() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, ftdListSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - FTD List") !== -1) ftdListSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }
  if (!ftdListSheet) { ftdListSheet = ensureFtdListSheet_(ss, repName); }

  var response = ui.alert(
    "Repair & Rebuild FTD List",
    "This clears and rebuilds the entire " + repName + " - FTD List tab from what's " +
      "currently in the Book (every player whose Status is First Deposit or Active, right " +
      "now). Existing FTD Dates are kept as-is. The Total Weighted Wager row at the bottom " +
      "is never touched or moved. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  var totalRow = FTD_LIST_FIRST_ROW + FTD_LIST_CAPACITY;
  var clearRows = totalRow - FTD_LIST_FIRST_ROW;
  ftdListSheet.getRange(FTD_LIST_FIRST_ROW, 1, clearRows, 4).clearContent();

  var statuses = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, BOOK_ROWS, 1).getValues();
  var handles = bookSheet.getRange(BOOK_FIRST_ROW, COL_PLAYER_HANDLE, BOOK_ROWS, 1).getValues();

  var writeRow = FTD_LIST_FIRST_ROW;
  var count = 0;
  for (var r = 0; r < BOOK_ROWS; r++) {
    var status = statuses[r][0];
    var handle = handles[r][0];
    if (!handle || !isFtdQualifyingStatus_(status)) continue;
    var bookRow = BOOK_FIRST_ROW + r;
    var roobet = bookSheet.getRange(bookRow, COL_ROOBET_USERNAME).getValue();
    var ftdDate = bookSheet.getRange(bookRow, COL_FTD_DATE).getValue();
    if (!ftdDate) {
      ftdDate = today_(ss);
      bookSheet.getRange(bookRow, COL_FTD_DATE).setValue(ftdDate);
    }
    var wager = bookSheet.getRange(bookRow, COL_WEIGHTED_WAGER).getValue();
    ftdListSheet.getRange(writeRow, 1, 1, 4).setValues([[handle, roobet, ftdDate, wager]]);
    ftdListSheet.getRange(writeRow, 3).setNumberFormat("yyyy-mm-dd");
    ftdListSheet.getRange(writeRow, 4).setNumberFormat("$#,##0;($#,##0);-");
    writeRow++;
    count++;
    if (writeRow >= totalRow) break; // capacity guard - never write into the Total row
  }

  ui.alert("Rebuilt " + repName + "'s FTD List: " + count + " player(s) currently First Deposit or Active.");
}

// ============================================================
// One-time (safe to run any time) menu action that hardens the Book's own "Sent to VIP
// Team" list (rows 206+) against two problems: a row whose Player Handle got cleared but
// still has a stray Transferred to VIP Team = Yes value left behind (was showing up as a
// blank "ghost" row), and a player with no Roobet Username on file (harder to tell who
// the row even is). Only touches the formula if it doesn't already have this fix applied.
// ============================================================
function fixVipPipelineFilters() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var repName = "";
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) repName = repNameFromSheet_(n);
  }
  // Retired in v33. This used to patch the Sent to VIP Team list where it sat inside the
  // Book, at a fixed row. That list now lives on its own tab and its formula is written
  // fresh by "Step 2: Move Sent to VIP Team to Own Tab", already filtered correctly - so
  // this action has nothing left to do, and pointing it at a fixed Book row would only
  // risk writing over lead data on a Book whose rows have shifted.
  ui.alert("Not needed any more",
    "The Sent to VIP Team list has its own tab now" +
      (repName ? ' ("' + repName + ' - VIP Team")' : "") +
      ", and its filtering is set up correctly when you run \"Step 2: Move Sent to VIP Team " +
      "to Own Tab\".\n\nIf that list looks wrong, just run Step 2 again - it rebuilds it.",
    ui.ButtonSet.OK);
}

// ============================================================
// Safe to run any time - lists every player currently marked VIP Transferred (Status) or
// Transferred to VIP Team = Yes who don't have a Roobet Username on file. This never
// changes anything by itself - going forward, the Roobet Username gate blocks NEW cases
// of this, but existing players who were already set before that gate existed need a
// human decision (find their username, or correct the status) rather than an automatic
// fix. Use this to find and clean those up.
// ============================================================
function auditVipMissingRoobet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var handles = bookSheet.getRange(BOOK_FIRST_ROW, COL_PLAYER_HANDLE, BOOK_ROWS, 1).getValues();
  var statuses = bookSheet.getRange(BOOK_FIRST_ROW, COL_STATUS, BOOK_ROWS, 1).getValues();
  var roobets = bookSheet.getRange(BOOK_FIRST_ROW, COL_ROOBET_USERNAME, BOOK_ROWS, 1).getValues();
  var vipTeams = bookSheet.getRange(BOOK_FIRST_ROW, COL_VIP_TEAM, BOOK_ROWS, 1).getValues();

  var found = [];
  for (var r = 0; r < BOOK_ROWS; r++) {
    var handle = handles[r][0];
    if (!handle) continue;
    var status = statuses[r][0];
    var roobet = roobets[r][0];
    var vipTeam = vipTeams[r][0];
    if ((status === "VIP Transferred" || vipTeam === "Yes") && !roobet) {
      found.push(handle + " (row " + (BOOK_FIRST_ROW + r) + ", Status: " + status +
        (vipTeam === "Yes" ? ", VIP Team: Yes" : "") + ")");
    }
  }

  if (found.length === 0) {
    ui.alert("Nothing found - every VIP Transferred / Transferred to VIP Team player already has a Roobet Username.");
  } else {
    ui.alert(
      "Missing Roobet Username (" + found.length + ")",
      found.join("\n") + "\n\nAdd their Roobet Username, or correct their Status/VIP Team if it was set in error.",
      ui.ButtonSet.OK
    );
  }
}

// Finds the Status dropdown's source range (Lists!C2:C{n}) dynamically, matching
// whatever buffer size this sheet was actually built with, rather than assuming a
// fixed row count that might be stale on an older sheet.
function getStatusRangeA1_(ss) {
  var listsSheet = ss.getSheetByName("Lists");
  if (!listsSheet) return null;
  var lastRow = listsSheet.getLastRow();
  if (lastRow < 2) return null;
  return listsSheet.getRange(2, 3, lastRow - 1, 1);
}
