/**
 * Daily Gamba CRM - Apps Script automation (v35)
 * Paste this into Extensions > Apps Script on EVERY rep's individual sheet, replacing
 * everything currently there. One-time setup per sheet, then everything below runs
 * automatically.
 *
 * ============================================================================
 * ONE-TIME UPGRADE - run these four in order from the Daily Gamba Tools menu:
 *   Step 1: Expand Book to 1000 Rows
 *   Step 2: Move Sent to VIP Team to Own Tab
 *   Step 3: Expand Daily Task Queue to 150 Rows
 *   Step 4: Expand Dead Lead Reactivation to 500 Rows
 * Order matters - each one shifts rows the next one is looking for. All four are safe to
 * re-run. Separately, run "Set This Sheet's Time Zone" on any sheet whose rep is not in
 * the sheet's current time zone.
 * ============================================================================
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
var DT_MAIN_ROWS = 150;
var DT_MAIN_FIRST_ROW = HEADER_ROW_DAILY_TASK + 1;              // 5
var DT_MAIN_LAST_ROW = DT_MAIN_FIRST_ROW + DT_MAIN_ROWS - 1;    // 154
var PRE_V31_MAIN_LAST_ROW = 64;

// Dead Lead Reactivation block - 200 up to v30, 500 from v31 on. Its header sits 2 blank
// rows below the main queue's last row.
var REACT_ROWS = 500;
var REACT_HEADER_ROW = DT_MAIN_LAST_ROW + 3;              // 157
var REACT_FIRST_ROW = REACT_HEADER_ROW + 1;               // 158
var REACT_LAST_ROW = REACT_FIRST_ROW + REACT_ROWS - 1;    // 657

// Task Complete / Status / Notes edits stay actionable down through the Reactivation block.
var DT_ACTIONABLE_LAST_ROW = REACT_LAST_ROW;

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
    .addItem("Set This Sheet's Time Zone", "setSheetTimeZone")
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
    .addItem("Step 3: Expand Daily Task Queue to 150 Rows", "expandDailyTaskMainQueue")
    .addItem("Step 4: Expand Dead Lead Reactivation to 500 Rows", "expandDeadLeadReactivation")
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

    fDueFlag.push(['=IF($B' + r + '="",0,IF(OR(AND(ISNUMBER($J' + r + '),$J' + r +
      '<=TODAY(),$E' + r + '<>"Dead Lead"),AND($D' + r + '="",$E' + r + '<>"",$E' + r +
      '<>"Dead Lead",OR($I' + r + '="",$I' + r + '<TODAY()))),1,0))']);

    fDueRank.push(['=IF($R' + r + '=1,SUMPRODUCT(($R$' + BOOK_FIRST_ROW + ':$R$' + BOOK_LAST_ROW +
      '=1)*(($Q$' + BOOK_FIRST_ROW + ':$Q$' + BOOK_LAST_ROW + '>$Q' + r + ')+(($Q$' + BOOK_FIRST_ROW +
      ':$Q$' + BOOK_LAST_ROW + '=$Q' + r + ')*(ROW($Q$' + BOOK_FIRST_ROW + ':$Q$' + BOOK_LAST_ROW +
      ')<ROW($Q' + r + ')))))+1,"")']);

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

  ui.alert("Repaired all " + BOOK_ROWS + " Book rows.\n\nFormulas rebuilt:\n" +
    "- Player ID, Health, Priority, Next Follow-Up, Next Action, VIP Ready\n" +
    "- The hidden helpers behind the Daily Task, Coming Up and Dead Lead Reactivation lists\n" +
    "- Follow-Up Attempts and the VIP check-in counters were seeded only where they were " +
    "blank, so no real counts or dates were overwritten\n\n" +
    "Appearance restored across " + fmt.rows + " rows (borders, shading, date formats and the " +
    "Status / Health / KYC / Deposit dropdowns), copied from row " + fmt.templateRow + ".\n\n" +
    "If Daily Task or Reactivation was showing blank or wrong because a formula got corrupted " +
    "anywhere in those columns (e.g. from a partial row delete/shift), it should be fixed now - " +
    "give it a few seconds to recalculate.");
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
