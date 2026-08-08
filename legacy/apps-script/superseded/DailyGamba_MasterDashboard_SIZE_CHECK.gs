/**
 * Daily Gamba MASTER DASHBOARD - SIZE CHECK
 *
 * Paste into the MASTER DASHBOARD spreadsheet, replacing what is there now. Reload, then
 * run: Daily Gamba Master Tools > Check Spreadsheet Size.
 *
 * WHY
 * Moneyheist has 176 players. The Master's pull returns 88, and forcing a genuinely fresh
 * fetch did not change that. So the pull is being truncated at Google's end rather than by
 * anything in the formulas.
 *
 * The usual reason is the spreadsheet running out of cell capacity. A Google Sheet holds a
 * maximum of 10 million cells, counting every cell in every tab whether or not anything is
 * in it - an empty 1000x26 tab still costs 26,000. As a file approaches the cap, IMPORTRANGE
 * results start coming back short, silently, with no error.
 *
 * This counts what the file is actually using and shows the biggest tabs. It reads only -
 * it changes nothing at all.
 *
 * The second action, Trim Oversized Import Tabs, is the fix IF the count comes back high.
 * Do not run it until you have seen the numbers.
 */

var CELL_LIMIT = 10000000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Daily Gamba Master Tools")
    .addItem("Check Spreadsheet Size (read-only)", "checkSpreadsheetSize")
    .addItem("Trim Oversized Import Tabs", "trimImportTabs")
    .addToUi();
}

function checkSpreadsheetSize() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  var total = 0;
  var rows = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var r = sh.getMaxRows();
    var c = sh.getMaxColumns();
    var cells = r * c;
    total += cells;
    rows.push({ name: sh.getName(), r: r, c: c, cells: cells });
  }

  rows.sort(function (a, b) { return b.cells - a.cells; });

  var top = [];
  for (var t = 0; t < Math.min(rows.length, 15); t++) {
    top.push(rows[t].name + "  -  " + rows[t].r + " rows x " + rows[t].c + " cols = " +
      rows[t].cells.toLocaleString() + " cells");
  }

  var pct = Math.round((total / CELL_LIMIT) * 1000) / 10;
  var verdict;
  if (total > CELL_LIMIT * 0.9) {
    verdict = "AT THE LIMIT. This is almost certainly why pulls are coming back short.\n" +
      "Run Trim Oversized Import Tabs.";
  } else if (total > CELL_LIMIT * 0.6) {
    verdict = "HIGH. Not yet at the cap but close enough to be worth trimming.\n" +
      "Run Trim Oversized Import Tabs.";
  } else {
    verdict = "FINE. Capacity is NOT the reason pulls are short - the cause is something " +
      "else and trimming will not help. Do not run the trim.";
  }

  ui.alert("Spreadsheet size",
    "Total: " + total.toLocaleString() + " cells of " + CELL_LIMIT.toLocaleString() +
      "  (" + pct + "%)\n\n" + verdict + "\n\nBiggest tabs:\n" + top.join("\n"),
    ui.ButtonSet.OK);
}

// ============================================================
// Shrinks each hidden import tab to the size its pull actually needs, and no more.
// Only ever REMOVES empty rows and columns beyond what the formula returns - it never
// touches the formula itself, and the data reappears the moment the pull refreshes.
// ============================================================
function trimImportTabs() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  var confirm = ui.alert("Trim Oversized Import Tabs",
    "This removes empty rows and columns from the hidden _Import tabs so they only take up " +
      "the space their pull actually needs.\n\nIt never touches a formula, and it never " +
      "touches a visible tab. The imported data reappears as soon as each pull refreshes.\n\n" +
      "Continue?", ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var freed = 0;
  var lines = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    if (name.indexOf("_Import ") !== 0) continue;

    var formula = sh.getRange(1, 1).getFormula();
    if (!formula) continue;

    // How many rows does this pull actually ask for?
    var wantRows = 220;
    var m = /![A-Z]+(\d+):[A-Z]+(\d+)/.exec(formula);
    if (m) wantRows = (Number(m[2]) - Number(m[1]) + 1) + 20;
    // Activity Log pulls are genuinely large - leave those alone.
    if (name.lastIndexOf(" ActivityLog") === name.length - 12) continue;

    // How many columns does it actually produce?
    var wantCols = Math.max(sh.getLastColumn(), 6) + 2;

    var before = sh.getMaxRows() * sh.getMaxColumns();

    if (sh.getMaxRows() > wantRows) {
      sh.deleteRows(wantRows + 1, sh.getMaxRows() - wantRows);
    }
    if (sh.getMaxColumns() > wantCols) {
      sh.deleteColumns(wantCols + 1, sh.getMaxColumns() - wantCols);
    }

    var after = sh.getMaxRows() * sh.getMaxColumns();
    if (after < before) {
      freed += (before - after);
      lines.push(name + ": " + before.toLocaleString() + " -> " + after.toLocaleString());
    }
  }

  ui.alert("Trimmed",
    (freed > 0
      ? "Freed " + freed.toLocaleString() + " cells.\n\n" + lines.join("\n") +
        "\n\nRun Check Spreadsheet Size again to see the new total, then give the pulls a " +
        "few minutes and check whether Moneyheist now reads 176."
      : "Nothing needed trimming - the import tabs are already the right size."),
    ui.ButtonSet.OK);
}
