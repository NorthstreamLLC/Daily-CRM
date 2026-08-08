/**
 * Daily Gamba MASTER DASHBOARD - UNDO the widen-to-1000 change
 *
 * Paste this into the MASTER DASHBOARD spreadsheet, replacing the widen script that is in
 * there now. Then run: Daily Gamba Master Tools > UNDO - Put Master Back to 200 Rows.
 *
 * WHAT WENT WRONG
 * The widen script changed every reference to a rep's Book from 200 rows to 1000, and
 * deliberately left the FTD List references at 200 (widening those would have dragged each
 * rep's Total row into the imported data). That was the mistake: some formulas on the
 * Executive Dashboard use COUNTIFS across a Book range AND an FTD List range in the same
 * expression, and COUNTIFS requires every range in it to be exactly the same height. A
 * 1000-row Book range next to a 200-row FTD List range is invalid, so those formulas error
 * - and on a dashboard that stacks every rep together, one bad formula takes the view down.
 *
 * Widening the Master was premature anyway: it only helps once EVERY rep's Book has actually
 * been expanded to 1000 rows. Until then the Master is reaching for rows that do not exist
 * in most of the source sheets.
 *
 * This puts every reference back exactly as it was. It is a straight reversal - 1003 back to
 * 203 in the hidden import tabs, 1000 back to 200 in the formulas that read them. Nothing
 * else is touched. Safe to run more than once.
 */

var UNDO_NEW_BOOK_LAST_ROW = 1003;
var UNDO_OLD_BOOK_LAST_ROW = 203;
var UNDO_NEW_ROWS = 1000;
var UNDO_OLD_ROWS = 200;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Daily Gamba Master Tools")
    .addItem("UNDO - Put Master Back to 200 Rows", "undoMasterWiden")
    .addToUi();
}

function undoMasterWiden() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  var importTabsFixed = [];
  var formulaCellsFixed = 0;
  var tabsTouched = [];

  // ---- 1. Hidden import tabs: pull rows 4-203 again ----
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf("_Import ") !== 0) continue;
    var isBook = name.lastIndexOf(" Book") === name.length - 5;
    var isVipTeam = name.lastIndexOf(" VIPTeam") === name.length - 8;
    if (!isBook && !isVipTeam) continue;

    var cell = sheets[i].getRange(1, 1);
    var formula = cell.getFormula();
    if (!formula) continue;

    var updated = formula.replace(
      new RegExp("([A-Z]+4:[A-Z]+)" + UNDO_NEW_BOOK_LAST_ROW + "(?![0-9])", "g"),
      "$1" + UNDO_OLD_BOOK_LAST_ROW
    );
    if (updated !== formula) {
      cell.setFormula(updated);
      importTabsFixed.push(name);
    }
  }

  // ---- 2. Every formula reading those tabs: back to 1:200 ----
  var bookRefPattern = new RegExp(
    "('_Import [^']+ (?:Book|VIPTeam)'![A-Z]+[0-9]*:[A-Z]+)" + UNDO_NEW_ROWS + "(?![0-9])",
    "g"
  );

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getName().indexOf("_Import ") === 0) continue;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) continue;

    var range = sheet.getRange(1, 1, lastRow, lastCol);
    var formulas = range.getFormulas();
    var changedHere = 0;

    for (var r = 0; r < formulas.length; r++) {
      for (var c = 0; c < formulas[r].length; c++) {
        var f = formulas[r][c];
        if (!f || f.indexOf("_Import ") === -1) continue;
        var nf = f.replace(bookRefPattern, "$1" + UNDO_OLD_ROWS);
        if (nf !== f) {
          formulas[r][c] = nf;
          changedHere++;
        }
      }
    }

    if (changedHere > 0) {
      range.setFormulas(formulas);
      formulaCellsFixed += changedHere;
      tabsTouched.push(sheet.getName() + " (" + changedHere + ")");
    }
  }

  if (importTabsFixed.length === 0 && formulaCellsFixed === 0) {
    ui.alert("Nothing to undo",
      "No reference is still pointing at " + UNDO_NEW_ROWS + " rows - the Master is already " +
        "back to its original " + UNDO_OLD_ROWS + "-row setup.\n\n" +
        "If the dashboard still looks wrong, the cause is something else - say so and it can " +
        "be looked at properly rather than guessed at.",
      ui.ButtonSet.OK);
    return;
  }

  ui.alert("Master reverted to " + UNDO_OLD_ROWS + " rows",
    "Import tabs put back to rows 4-" + UNDO_OLD_BOOK_LAST_ROW + ": " + importTabsFixed.length +
      "\nFormulas put back to " + UNDO_OLD_ROWS + " rows: " + formulaCellsFixed +
      (tabsTouched.length ? "\n" + tabsTouched.join("\n") : "") +
      "\n\nGive it a minute to re-pull from the rep sheets - IMPORTRANGE is slow to settle.\n\n" +
      "The Master is now exactly as it was before the widen. It reaches Book row 203 per rep, " +
      "which is correct while the rep Books are still their original size.",
    ui.ButtonSet.OK);
}
