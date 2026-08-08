/**
 * Daily Gamba MASTER DASHBOARD - RECOVERY
 *
 * Paste this into the MASTER DASHBOARD spreadsheet, replacing whatever is in there now.
 * Reload the sheet, then use the "Daily Gamba Master Tools" menu.
 *
 * Run them in this order:
 *   1. Import Health Report   - changes nothing, tells us what is actually being pulled
 *   2. Undo Widen to 200 Rows - puts every range back to the original 200-row setup
 *   3. Force Refresh Imports  - makes IMPORTRANGE re-fetch instead of serving cached data
 *
 * WHY THE REPORT COMES FIRST
 * The Master showing 88 players for a rep who has 176, and showing overdue tasks that were
 * already dealt with, are two different kinds of failure:
 *   - Wrong COUNT means the pull itself is truncated or erroring.
 *   - STALE data means the pull is fine but IMPORTRANGE is serving an old cached copy.
 * The report separates them, per rep, so the fix is aimed at the real cause instead of
 * guessed at.
 *
 * A LIKELY CULPRIT, WHICH THE REPORT WILL CONFIRM OR RULE OUT
 * Each "_Import <Rep> Book" tab is a real sheet with a fixed number of rows. Widening the
 * pull to 1000 rows asks IMPORTRANGE to spill 1000 rows into a tab that may only physically
 * have a couple of hundred. When a spill does not fit, Google truncates it or errors the
 * whole formula. The report prints each tab's physical row count next to how many rows it
 * actually returned, which makes that visible immediately.
 */

var REC_NEW_BOOK_LAST_ROW = 1003;
var REC_OLD_BOOK_LAST_ROW = 203;
var REC_NEW_ROWS = 1000;
var REC_OLD_ROWS = 200;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Daily Gamba Master Tools")
    .addItem("1. Import Health Report (changes nothing)", "importHealthReport")
    .addItem("2. Undo Widen - back to 200 Rows", "undoMasterWiden")
    .addItem("3. Force Refresh Imports", "forceRefreshImports")
    .addToUi();
}

function importTabs_(ss) {
  var out = [];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf("_Import ") === 0) out.push(sheets[i]);
  }
  return out;
}

// ============================================================
// 1. Import Health Report - read-only.
// For every hidden import tab: what the formula asks for, how many rows the tab physically
// has, how many rows actually came back, and whether the cell is sitting on an error.
// ============================================================
function importHealthReport() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = importTabs_(ss);
  if (tabs.length === 0) { ui.alert("No _Import tabs found in this spreadsheet."); return; }

  var lines = [];
  var problems = [];

  for (var i = 0; i < tabs.length; i++) {
    var sh = tabs[i];
    var name = sh.getName();
    var a1 = sh.getRange(1, 1);
    var formula = a1.getFormula();
    var physicalRows = sh.getMaxRows();

    // What range is the formula reaching for?
    var asked = "";
    var m = /![A-Z]+\d+:[A-Z]+(\d+)/.exec(formula);
    if (m) asked = m[1];

    // How much actually came back - count non-empty rows in the first two columns.
    var scan = Math.min(physicalRows, 1100);
    var vals = sh.getRange(1, 1, scan, Math.min(sh.getMaxColumns(), 2)).getValues();
    var returned = 0;
    for (var r = 0; r < vals.length; r++) {
      if ((vals[r][0] !== "" && vals[r][0] !== null) ||
          (vals.length && vals[r][1] !== "" && vals[r][1] !== null)) returned++;
    }

    var display = a1.getDisplayValue();
    var errored = display.indexOf("#REF") === 0 || display.indexOf("#ERROR") === 0 ||
                  display.indexOf("#N/A") === 0 || display.indexOf("#VALUE") === 0;

    lines.push(name + "\n    asks for up to row " + (asked || "?") +
      " | tab physically has " + physicalRows + " rows" +
      " | returned " + returned + " rows" + (errored ? " | CELL IS ERRORING: " + display : ""));

    if (errored) problems.push(name + " is erroring (" + display + ")");
    else if (asked && Number(asked) > physicalRows) {
      problems.push(name + " asks for row " + asked + " but the tab only has " +
        physicalRows + " rows - the pull cannot fit and will truncate or fail");
    } else if (returned === 0) {
      problems.push(name + " returned nothing at all");
    }
  }

  var msg = (problems.length
      ? problems.length + " PROBLEM" + (problems.length > 1 ? "S" : "") + ":\n- " +
        problems.join("\n- ") + "\n\n"
      : "No obvious problem found in the pulls themselves. If counts are still wrong, the " +
        "data is stale rather than broken - run Force Refresh Imports.\n\n") +
    "Every import tab:\n" + lines.join("\n");

  ui.alert("Import Health Report", msg, ui.ButtonSet.OK);
}

// ============================================================
// 2. Undo the widen - every range back to the original 200-row setup.
// ============================================================
function undoMasterWiden() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var importsFixed = 0, formulaCells = 0;

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf("_Import ") !== 0) continue;
    var isBook = name.lastIndexOf(" Book") === name.length - 5;
    var isVip = name.lastIndexOf(" VIPTeam") === name.length - 8;
    if (!isBook && !isVip) continue;
    var cell = sheets[i].getRange(1, 1);
    var f = cell.getFormula();
    if (!f) continue;
    var u = f.replace(new RegExp("([A-Z]+4:[A-Z]+)" + REC_NEW_BOOK_LAST_ROW + "(?![0-9])", "g"),
      "$1" + REC_OLD_BOOK_LAST_ROW);
    if (u !== f) { cell.setFormula(u); importsFixed++; }
  }

  var pat = new RegExp("('_Import [^']+ (?:Book|VIPTeam)'![A-Z]+[0-9]*:[A-Z]+)" +
    REC_NEW_ROWS + "(?![0-9])", "g");

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getName().indexOf("_Import ") === 0) continue;
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) continue;
    var range = sheet.getRange(1, 1, lastRow, lastCol);
    var fs = range.getFormulas();
    var changed = 0;
    for (var r = 0; r < fs.length; r++) {
      for (var c = 0; c < fs[r].length; c++) {
        if (!fs[r][c] || fs[r][c].indexOf("_Import ") === -1) continue;
        var nf = fs[r][c].replace(pat, "$1" + REC_OLD_ROWS);
        if (nf !== fs[r][c]) { fs[r][c] = nf; changed++; }
      }
    }
    if (changed > 0) { range.setFormulas(fs); formulaCells += changed; }
  }

  ui.alert("Undo complete",
    "Import tabs put back to row " + REC_OLD_BOOK_LAST_ROW + ": " + importsFixed +
      "\nFormulas put back to " + REC_OLD_ROWS + " rows: " + formulaCells +
      (importsFixed + formulaCells === 0
        ? "\n\nNothing was still widened - the Master was already back to its original setup."
        : "\n\nNow run Force Refresh Imports, then give it a minute."),
    ui.ButtonSet.OK);
}

// ============================================================
// 3. Force Refresh Imports.
// IMPORTRANGE caches aggressively, and once a formula has errored it can keep serving the
// stale copy even after the cause is fixed. That is what showing already-handled tasks as
// still overdue looks like. Clearing each formula, flushing, and putting it straight back
// forces Google to genuinely re-fetch from every rep sheet.
// Nothing is lost - the formula is written back identically.
// ============================================================
function forceRefreshImports() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = importTabs_(ss);
  if (tabs.length === 0) { ui.alert("No _Import tabs found."); return; }

  var refreshed = 0;
  for (var i = 0; i < tabs.length; i++) {
    var cell = tabs[i].getRange(1, 1);
    var f = cell.getFormula();
    if (!f) continue;
    cell.clearContent();
    SpreadsheetApp.flush();
    cell.setFormula(f);
    SpreadsheetApp.flush();
    refreshed++;
  }

  ui.alert("Refreshed " + refreshed + " import tabs",
    "Every IMPORTRANGE has been cleared and re-issued, so Google has to fetch fresh data " +
      "rather than serve its cached copy.\n\nThis takes a minute or two to fully settle - " +
      "counts will look wrong while it is still loading. Re-run the Import Health Report " +
      "afterwards to confirm the numbers landed.",
    ui.ButtonSet.OK);
}
