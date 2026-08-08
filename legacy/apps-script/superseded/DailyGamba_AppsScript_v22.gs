/**
 * Daily Gamba CRM - Apps Script automation (v22)
 * Paste this into Extensions > Apps Script on EVERY rep's individual sheet, replacing
 * everything currently there. One-time setup per sheet, then everything below runs
 * automatically.
 *
 * v22 changes from v21 - three pieces:
 * - Daily Task Notes now writes back to the Book instead of being a trap. It's designed
 *   as a live read-only pull from that player's Notes cell on the Book, but typing
 *   directly into it used to overwrite that formula with frozen plain text - so as the
 *   queue re-ranked, a different player would rotate into that row while the old notes
 *   stayed stuck there. Now, typing a note on Daily Task saves it to the real player's
 *   Book row (same push-then-reset pattern already used for the Status column here),
 *   then resets the cell back to live-pull mode - safe to jot notes from either tab.
 * - New one-time menu action, "Update Status Cadence & Options", for sheets that are
 *   already live: changes Dead Lead's re-target cadence from ~60 days to ~30 days, and
 *   adds "Potential Lead" as a Status option if it's not already there (was Tuna-only
 *   before - for a player who's gone quiet after several days of daily outreach, switch
 *   them here to drop the cadence to every 7 days instead of grinding daily attempts or
 *   giving up entirely). Both land directly on the Lists tab, which only holds shared
 *   reference data (status names, cadences, dropdown options) - never real player data -
 *   so this is safe to run on a live sheet with real leads.
 * - New sheets built going forward already have both of these baked in from the start.
 *
 * v21 changes from v20 - stagnant-wager highlight on the FTD List:
 * - When you re-type a Total Wager number that's the SAME as what was there before (i.e.
 *   their wager didn't move since your last monthly update), that row turns light red on
 *   the FTD List - a clear visual nudge to go check in on that player. Type in a
 *   DIFFERENT number (higher or lower) and the highlight clears automatically.
 *
 * v20 changes from v19 - two new pieces, both driven straight off columns you already edit:
 * - FTD List: the moment a player's Status is set to First Deposit, the script now ALSO
 *   adds them to the "<Rep> - FTD List" tab. They stay on the Book as normal too.
 * - Auto-hide on VIP Transfer: the moment Transferred to VIP Team is set to "Yes" on the
 *   Book, that row is hidden from view. Flip it back off "Yes" and the row reappears.
 *
 * v19 changes from v18 - ROOT CAUSE FIX: FTD Date is now stamped directly by the script
 * the instant Status is changed to First Deposit (a real value, not a live formula).
 *
 * v14 changes from v13 - "Done" renamed to "Task Complete" on Daily Task; "Apply July
 * Feature Update" menu action added overdue red highlighting, Sent to VIP Team list.
 *
 * ONE-TIME SETUP after pasting this in: reload the sheet, then run "Fix Wager & FTD
 * Tracking", "Apply July Feature Update", and "Update Status Cadence & Options"
 * (whichever you haven't already), and "Set Up Bulk Import Sheet" if you haven't from
 * v13. All are safe to run twice - each checks before it changes anything.
 */

var HEADER_ROW_BOOK = 3;
var HEADER_ROW_DAILY_TASK = 4;

var DT_ACTIONABLE_LAST_ROW = 97;

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
var FTD_LIST_COL_TOTAL_WAGER = 5; // E - the only manually-edited column on that tab
var STAGNANT_WAGER_COLOR = "#F4CCCC";

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

// Book capacity - must match the build script (BOOK_ROWS = 200).
var BOOK_ROWS = 200;
var BOOK_FIRST_ROW = HEADER_ROW_BOOK + 1;   // 4
var BOOK_LAST_ROW = BOOK_FIRST_ROW + BOOK_ROWS - 1; // 203

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
// the Book, Daily Task, Stats, or Activity Log. Returns the existing sheet unchanged if
// it's already there. Only called from the one-time menu action (needs full
// authorization to insert a sheet) - the onEdit path just skips quietly if it's missing.
function ensureFtdListSheet_(ss, repName) {
  var sheetName = repName + " - FTD List";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1).setValue(repName + "'s FTD List — First Time Depositors");
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  sheet.getRange(2, 1, 1, 5).merge();
  sheet.getRange(2, 1).setValue(
    "Added automatically the moment a player's Status is set to First Deposit on the Book - " +
    "nothing to do here except fill in Total Wager by hand once a month. Roobet Username and " +
    "Weighted Wager are pulled in automatically and read-only; players also stay on the Book " +
    "as usual, this is just a clean, dedicated view. If a row turns light red, it means you " +
    "re-entered the same Total Wager as last time - that player hasn't grown, go check in."
  );
  sheet.getRange(2, 1).setWrap(true).setFontStyle("italic").setFontColor("#666666");
  sheet.setRowHeight(2, 40);

  var headers = ["Player Handle", "Roobet Username", "FTD Date", "Weighted Wager",
                 "Total Wager\n(manual, monthly)"];
  sheet.getRange(FTD_LIST_HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(FTD_LIST_HEADER_ROW, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF").setWrap(true);
  sheet.setRowHeight(FTD_LIST_HEADER_ROW, 32);

  sheet.getRange(FTD_LIST_FIRST_ROW, 3, BOOK_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(FTD_LIST_FIRST_ROW, 4, BOOK_ROWS, 1).setNumberFormat("$#,##0;($#,##0);-");
  sheet.getRange(FTD_LIST_FIRST_ROW, 5, BOOK_ROWS, 1).setNumberFormat("$#,##0;($#,##0);-");

  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 150);
  sheet.setFrozenRows(FTD_LIST_HEADER_ROW);

  return sheet;
}

// Adds a player to the "<Rep> - FTD List" tab the first time they hit First Deposit -
// idempotent (checks the list first, never adds the same handle twice, safe if Status
// gets toggled back and forth). Quietly does nothing if that tab doesn't exist yet on
// this spreadsheet (older sheet that hasn't run "Fix Wager & FTD Tracking" yet).
function appendToFtdListIfNeeded_(ss, repName, bookSheet, row) {
  var ftdListSheet = ss.getSheetByName(repName + " - FTD List");
  if (!ftdListSheet) return;

  var handle = bookSheet.getRange(row, COL_PLAYER_HANDLE).getValue();
  if (!handle) return;

  var lastRow = ftdListSheet.getLastRow();
  if (lastRow >= FTD_LIST_FIRST_ROW) {
    var existingHandles = ftdListSheet
      .getRange(FTD_LIST_FIRST_ROW, 1, lastRow - FTD_LIST_FIRST_ROW + 1, 1)
      .getValues();
    for (var i = 0; i < existingHandles.length; i++) {
      if (existingHandles[i][0] === handle) return; // already on the list
    }
  }

  var roobet = bookSheet.getRange(row, COL_ROOBET_USERNAME).getValue();
  var ftdDate = bookSheet.getRange(row, COL_FTD_DATE).getValue() || today_(ss);
  var wager = bookSheet.getRange(row, COL_WEIGHTED_WAGER).getValue();
  var targetRow = Math.max(lastRow + 1, FTD_LIST_FIRST_ROW);
  ftdListSheet.getRange(targetRow, 1, 1, 4).setValues([[handle, roobet, ftdDate, wager]]);
  ftdListSheet.getRange(targetRow, 3).setNumberFormat("yyyy-mm-dd");
  ftdListSheet.getRange(targetRow, 4).setNumberFormat("$#,##0;($#,##0);-");
  ftdListSheet.getRange(targetRow, 5).setNumberFormat("$#,##0;($#,##0);-");
}

// Hides (or reveals) a Book row based on the Transferred to VIP Team value - "Yes" means
// they're off the rep's plate, so the row disappears from the normal working view without
// touching the data or shifting any other rows/row-numbers.
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

// Stamps FTD Date the first (and only the first) time a player's Status becomes
// "First Deposit" - a real value written once, never overwritten afterward - and adds
// them to the FTD List the same moment.
function stampFtdDateIfNeeded_(bookSheet, row, ss, newStatus, repName) {
  if (newStatus !== "First Deposit") return;
  var ftdCell = bookSheet.getRange(row, COL_FTD_DATE);
  if (!ftdCell.getValue()) {
    ftdCell.setValue(today_(ss));
  }
  appendToFtdListIfNeeded_(ss, repName, bookSheet, row);
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

function handleBookEdit_(e, sheet) {
  if (!e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  var row = e.range.getRow();
  if (row <= HEADER_ROW_BOOK) return;
  var col = e.range.getColumn();
  var ss = e.source;
  var repName = repNameFromSheet_(sheet.getName());

  if (col === COL_PLAYER_HANDLE) {
    var handle = sheet.getRange(row, COL_PLAYER_HANDLE).getValue();
    if (handle) {
      initializeNewLead_(sheet, row, ss, repName, !e.oldValue);
    }
    return;
  }

  if (col === COL_ROOBET_USERNAME) {
    if (e.value) {
      sheet.getRange(row, COL_ATTEMPTS).setValue(0);
    }
    return;
  }

  if (col === COL_STATUS) {
    var oldStatus = e.oldValue || "";
    var newStatusVal = e.value || "";
    if (newStatusVal === "VIP Transferred") {
      startStageTracking_(sheet, row, COL_VIPFT_DATE, COL_VIPFT_ATTEMPTS);
    }
    stampFtdDateIfNeeded_(sheet, row, ss, newStatusVal, repName);
    logStatusChange_(ss, repName, sheet, row, oldStatus, newStatusVal);
    return;
  }

  if (col === COL_VIP_TEAM) {
    updateVipHideForRow_(sheet, row, e.value);
    if (e.value === "Yes") {
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

  var bk = "'" + repName + " - Book'";
  sheet.getRange(row, DT_COL_STATUS).setFormula(
    '=IF($B' + row + '="","",INDEX(' + bk + '!$E:$E,$B' + row + '))'
  );
}

// Notes on Daily Task is normally a live pull from the Book (so it always shows the
// CURRENT row-occupant's notes, even as the queue re-ranks day to day). Typing directly
// into it used to overwrite that formula with frozen plain text - this handler catches
// that: it saves what was typed onto the player's real Book row, then resets this cell
// back to the live-pull formula, so it keeps self-healing instead of getting stuck.
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
      protectColumns_(sheet, [6, 7, 10, 11, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31],
        "This column is calculated automatically, or maintained by the script (Health / " +
        "Next Action / DueRank / Follow-Up Attempts / VIP checkpoint dates+counters / Coming " +
        "Up ranking). Typing over it can break the automation - edit Status, Roobet Username, " +
        "VIP Team, or the other input columns instead.");
      touched++;
    } else if (name.indexOf(" - Daily Task") !== -1) {
      // Status (9) and Notes (13) are NOT protected - both are meant to be edited right
      // here and push back to the Book automatically.
      protectColumns_(sheet, [2, 3, 4, 5, 6, 7, 8, 10, 11, 12],
        "This is pulled automatically from the Book - edit it there instead " +
        "(only Task Complete, Status, and Notes are meant to be changed here).");
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

// Highlights a row on the "<Rep> - FTD List" tab light red when the Total Wager cell is
// re-entered with the SAME value it had before (their wager hasn't moved since the last
// monthly update - a nudge to go check in on that player). Typing in a different number
// clears the highlight. First-time entries (cell was blank before) never highlight.
function handleFtdListEdit_(e, sheet) {
  if (!e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row <= FTD_LIST_HEADER_ROW || col !== FTD_LIST_COL_TOTAL_WAGER) return;

  var oldVal = e.oldValue;
  var newVal = e.value;
  var rowRange = sheet.getRange(row, 1, 1, 5);

  var oldIsNumber = oldVal !== undefined && oldVal !== null && oldVal !== "" && !isNaN(Number(oldVal));
  var newIsNumber = newVal !== undefined && newVal !== null && newVal !== "" && !isNaN(Number(newVal));

  if (oldIsNumber && newIsNumber && Number(oldVal) === Number(newVal)) {
    rowRange.setBackground(STAGNANT_WAGER_COLOR);
  } else {
    rowRange.setBackground(null);
  }
}

// Menu: Clean Up Deleted Leads, Bulk Import setup, July feature update, wager/FTD fix,
// status cadence/options fix.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Daily Gamba Tools")
    .addItem("Clean Up Deleted Leads", "cleanUpDeletedLeads")
    .addSeparator()
    .addItem("Set Up Bulk Import Sheet (one-time)", "setupBulkImportSheet")
    .addItem("Import Bulk Leads", "importBulkLeads")
    .addSeparator()
    .addItem("Apply July Feature Update (one-time)", "applyJulyUpdate")
    .addItem("Fix Wager & FTD Tracking (one-time)", "fixWagerAndFtdTracking")
    .addItem("Update Status Cadence & Options (one-time)", "fixStatusCadenceAndOptions")
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

// ============================================================
// One-time, idempotent rollout of the July feature batch onto an EXISTING live sheet.
// ============================================================
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
  var reactHeaderRow = 67; // must match REACT_HEADER_ROW in build_crm2_mini.py

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
      '$AC$4:$AC$203="Yes"), "")'
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

// ============================================================
// One-time menu action that cleans up any leftover wager-tracking state from earlier
// versions and sets up the current design cleanly. Safe to run more than once.
// ============================================================
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

// ============================================================
// NEW in v22: one-time menu action that patches the (hidden) Lists tab on an already-live
// sheet - changes Dead Lead's re-target cadence to 30 days, and adds "Potential Lead" as
// a Status option if it's not already there. The Lists tab only holds shared reference
// data (status names, cadences, dropdown source lists) - never real player data - so this
// is safe to run on a live sheet. Also refreshes the descriptive note above the Dead Lead
// Reactivation block on Daily Task if it still mentions the old cadence.
// ============================================================
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
  var statusCol = listsSheet.getRange(1, 3, lastRow, 1).getValues(); // column C, includes header at index 0

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
