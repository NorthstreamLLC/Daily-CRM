/**
 * Daily Gamba CRM - Apps Script automation (v26)
 * Paste this into Extensions > Apps Script on EVERY rep's individual sheet, replacing
 * everything currently there. One-time setup per sheet, then everything below runs
 * automatically.
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

// Matches the new REACT_ROWS=200 capacity - the Reactivation block now runs all the way
// to row 267, so Task Complete / Status / Notes edits need to stay actionable that far
// down (was 97 back when the block only held 30 rows).
var DT_ACTIONABLE_LAST_ROW = 267;

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

// Book capacity - must match the build script (BOOK_ROWS = 200).
var BOOK_ROWS = 200;
var BOOK_FIRST_ROW = HEADER_ROW_BOOK + 1;   // 4
var BOOK_LAST_ROW = BOOK_FIRST_ROW + BOOK_ROWS - 1; // 203

// Reactivation block layout - fixed, matches build script (DAILY_TASK_ROWS=60 has been
// constant throughout this project, so REACT_HEADER_ROW has always landed on row 67).
var REACT_ROWS = 200;
var REACT_HEADER_ROW = 67;
var REACT_FIRST_ROW = REACT_HEADER_ROW + 1;              // 68
var REACT_LAST_ROW = REACT_FIRST_ROW + REACT_ROWS - 1;   // 267

function today_(ss) {
  var tz = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function sameDay_(value, ss) {
  if (!value) return false;
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

  sheet.getRange(FTD_LIST_FIRST_ROW, 3, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(FTD_LIST_FIRST_ROW, 4, BOOK_ROWS, 1).setNumberFormat("$#,##0;($#,##0);-");

  var totalRow = FTD_LIST_FIRST_ROW + BOOK_ROWS;
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

  var totalRow = FTD_LIST_FIRST_ROW + BOOK_ROWS;
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

  var totalRow = FTD_LIST_FIRST_ROW + BOOK_ROWS;
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
      // Roobet Username is required before a player can be marked VIP Transferred -
      // without one there's no way to identify their account once they're in the
      // urgent Day 1/2/3 fast-track queue. Revert the edit and explain why instead of
      // silently accepting it.
      var roobetForVip = sheet.getRange(row, COL_ROOBET_USERNAME).getValue();
      if (!roobetForVip) {
        sheet.getRange(row, COL_STATUS).setValue(isSingleCell ? (singleCellOldValue || "") : "");
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "Add a Roobet Username before setting Status to VIP Transferred.", "Blocked", 6
        );
        return;
      }
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
    if (vipVal === "Yes") {
      // Same Roobet Username requirement as VIP Transferred above - this is the actual
      // hand-off to the in-house VIP team, so it needs their account confirmed first.
      var roobetForVipTeam = sheet.getRange(row, COL_ROOBET_USERNAME).getValue();
      if (!roobetForVipTeam) {
        sheet.getRange(row, COL_VIP_TEAM).setValue(isSingleCell ? (singleCellOldValue || "") : "");
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "Add a Roobet Username before setting Transferred to VIP Team to Yes.", "Blocked", 6
        );
        return;
      }
    }
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

  if (newStatus === "VIP Transferred") {
    var roobetForVip = bookSheet.getRange(matchRow, COL_ROOBET_USERNAME).getValue();
    if (!roobetForVip) {
      var bk = "'" + repName + " - Book'";
      sheet.getRange(row, DT_COL_STATUS).setFormula(
        '=IF($B' + row + '="","",INDEX(' + bk + '!$E:$E,$B' + row + '))'
      );
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Add a Roobet Username before setting Status to VIP Transferred.", "Blocked", 6
      );
      return;
    }
  }

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
    .addSeparator()
    .addItem("Set Up Bulk Import Sheet (one-time)", "setupBulkImportSheet")
    .addItem("Import Bulk Leads", "importBulkLeads")
    .addSeparator()
    .addItem("Apply July Feature Update (one-time)", "applyJulyUpdate")
    .addItem("Fix Wager & FTD Tracking (one-time)", "fixWagerAndFtdTracking")
    .addItem("Update Status Cadence & Options (one-time)", "fixStatusCadenceAndOptions")
    .addItem("Expand Dead Lead Reactivation (one-time)", "expandDeadLeadReactivation")
    .addItem("Add Status Breakdown to Stats (one-time)", "addStatusBreakdown")
    .addItem("Fix Active Leads Definition (one-time)", "fixActiveLeadsDefinition")
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

  if (bookSheet.getRange(206, 1).getValue() !== "Player Handle") {
    bookSheet.getRange(205, 1).setValue(
      "Sent to VIP Team - players you've personally handed off (Transferred to VIP Team = Yes)."
    );
    bookSheet.getRange(205, 1).setFontStyle("italic").setFontColor("#666666").setFontSize(9);
    bookSheet.getRange(206, 1, 1, 5).setValues(
      [["Player Handle", "Status", "Health", "Last Contact Date", "Next VIP Check-in"]]
    );
    bookSheet.getRange(206, 1, 1, 5)
      .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    bookSheet.getRange(207, 1).setFormula(
      '=IFERROR(FILTER({$B$4:$B$203,$E$4:$E$203,$F$4:$F$203,$I$4:$I$203,$AE$4:$AE$203},' +
      '($AC$4:$AC$203="Yes")*($B$4:$B$203<>"")*($D$4:$D$203<>"")), "")'
    );
    bookSheet.getRange(207, 4, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
    bookSheet.getRange(207, 5, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
    applied.push('Added "Sent to VIP Team" list to the Book');
  }

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
  var searchLastRow = Math.min(dailyTaskSheet.getLastRow(), 400);
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
    applied.push("Expanded the Dead Lead Reactivation block from " + (currentLastDataRow - REACT_FIRST_ROW + 1) + " to 200 rows");
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

  var totalRow = FTD_LIST_FIRST_ROW + BOOK_ROWS;
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

  var totalRow = FTD_LIST_FIRST_ROW + BOOK_ROWS;
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
  var bookSheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf(" - Book") !== -1) bookSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var cell = bookSheet.getRange(207, 1);
  var currentFormula = cell.getFormula();
  if (!currentFormula) {
    ui.alert('Couldn\'t find the Sent to VIP Team list in its expected spot (row 207) - run "Apply July Feature Update" first.');
    return;
  }
  if (currentFormula.indexOf('$D$4:$D$203<>""') !== -1) {
    ui.alert("Already up to date - the Sent to VIP Team list already filters out blank handles and missing Roobet Usernames.");
    return;
  }
  if (currentFormula.indexOf('$AC$4:$AC$203="Yes"') === -1) {
    ui.alert("The Sent to VIP Team list formula doesn't look like what was expected - let Claude know before proceeding.");
    return;
  }

  cell.setFormula(
    '=IFERROR(FILTER({$B$4:$B$203,$E$4:$E$203,$F$4:$F$203,$I$4:$I$203,$AE$4:$AE$203},' +
    '($AC$4:$AC$203="Yes")*($B$4:$B$203<>"")*($D$4:$D$203<>"")), "")'
  );
  ui.alert("Updated the Sent to VIP Team list - it now excludes blank-handle rows and players without a Roobet Username.");
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
