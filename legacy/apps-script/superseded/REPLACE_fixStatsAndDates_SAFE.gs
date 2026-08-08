/**
 * REPLACE fixStatsAndDates AGAIN - the last one wiped the Stats tab labels.
 *
 * Find  function fixStatsAndDates()  in the rep script and replace the whole function with
 * this. Keep fsdToSerial_ and FSD_DATE_COLS as they are.
 *
 *
 * WHAT I GOT WRONG
 * To widen the Stats formulas I read the whole tab with getFormulas(), edited the ones I
 * wanted, and wrote the array back with setFormulas().
 *
 * getFormulas() returns an EMPTY STRING for any cell holding plain text. So the array I
 * wrote back had blanks where every heading and label used to be, and setFormulas dutifully
 * cleared them. The numbers survived because they are formulas. That is why the tab came
 * back with its dark header bars empty.
 *
 * THE FIX
 * This never writes an array back over a range. It collects only the cells whose formula
 * actually changed, and sets those one at a time. A cell it did not intend to change is
 * never written to at all, so nothing else on the tab can be affected.
 *
 * If your labels are still missing, undo (Ctrl+Z) on the Stats tab first - this does not
 * restore them, it only stops it happening again.
 */

function fixStatsAndDates() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, statsSheet, repName;
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = repNameFromSheet_(n); }
    if (n.indexOf(" - Stats") !== -1) statsSheet = sheets[i];
  }
  if (!bookSheet) { ui.alert("Couldn't find this file's Book tab."); return; }

  var lastRow = Math.min(bookSheet.getMaxRows(), BOOK_LAST_ROW);
  var count = lastRow - BOOK_FIRST_ROW + 1;
  if (count < 1) { ui.alert("Book looks empty."); return; }

  // ---- 1. strip the time off stamped dates ----
  // Writing a whole column of values back IS safe: every cell in these columns is a date
  // or blank, there are no labels among them.
  var cleanedPerCol = [], totalCleaned = 0;

  for (var c = 0; c < FSD_DATE_COLS.length; c++) {
    var col = FSD_DATE_COLS[c][0];
    if (col > bookSheet.getMaxColumns()) continue;

    var rng = bookSheet.getRange(BOOK_FIRST_ROW, col, count, 1);
    var vals = rng.getValues();
    var shown = rng.getDisplayValues();
    var out = [], cleaned = 0;

    for (var r = 0; r < count; r++) {
      var v = vals[r][0];
      if (v === "" || v === null) { out.push([""]); continue; }

      var isDate = Object.prototype.toString.call(v) === "[object Date]";
      var hasTime = isDate && (v.getHours() !== 0 || v.getMinutes() !== 0 || v.getSeconds() !== 0);
      var isTextDate = (typeof v === "string") && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

      if (!hasTime && !isTextDate) { out.push([v]); continue; }

      var s = String(shown[r][0]).trim();
      var y = 0, mo = 0, d = 0, parsed = false;

      var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (iso) { y = +iso[1]; mo = +iso[2] - 1; d = +iso[3]; parsed = true; }
      if (!parsed) {
        var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
        if (us) { mo = +us[1] - 1; d = +us[2]; y = +us[3]; parsed = true; }
      }
      if (!parsed && isDate) { y = v.getFullYear(); mo = v.getMonth(); d = v.getDate(); parsed = true; }
      if (!parsed && isTextDate) {
        var p = v.trim().split("-");
        y = +p[0]; mo = +p[1] - 1; d = +p[2]; parsed = true;
      }

      if (parsed) { out.push([fsdToSerial_(y, mo, d)]); cleaned++; }
      else out.push([v]);
    }

    if (cleaned > 0) {
      rng.setValues(out);
      rng.setNumberFormat("yyyy-mm-dd");
      totalCleaned += cleaned;
      cleanedPerCol.push(FSD_DATE_COLS[c][1] + ": " + cleaned);
    }
  }

  // ---- 2. widen the Stats formulas ----
  // ONE CELL AT A TIME. Never write an array back over the tab: getFormulas() gives an empty
  // string for text cells, so writing the array back erases every label on the sheet. That
  // is what happened last time.
  var widened = 0, widenedCells = [];
  if (statsSheet) {
    var bookRef = "'" + repName + " - Book'";
    var pattern = new RegExp(
      "(" + bookRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "!\\$[A-Z]+\\$\\d+:\\$[A-Z]+\\$)(198|199|200|203)(?![0-9])", "g");

    var sLastRow = statsSheet.getLastRow(), sLastCol = statsSheet.getLastColumn();
    if (sLastRow > 0 && sLastCol > 0) {
      var sFormulas = statsSheet.getRange(1, 1, sLastRow, sLastCol).getFormulas();
      for (var sr = 0; sr < sFormulas.length; sr++) {
        for (var sc = 0; sc < sFormulas[sr].length; sc++) {
          var f = sFormulas[sr][sc];
          if (!f || f.indexOf(" - Book'") === -1) continue;
          var nf = f.replace(pattern, "$1" + BOOK_LAST_ROW);
          if (nf === f) continue;
          statsSheet.getRange(sr + 1, sc + 1).setFormula(nf);   // just this one cell
          widened++;
          if (widenedCells.length < 12) {
            widenedCells.push(statsSheet.getRange(sr + 1, sc + 1).getA1Notation());
          }
        }
      }
    }
  }

  SpreadsheetApp.flush();

  ui.alert("Fix Stats",
    (totalCleaned > 0
      ? "Stripped the time off " + totalCleaned + " dates so they match TODAY() again:\n- " +
        cleanedPerCol.join("\n- ") + "\n\n"
      : "No dates needed cleaning - they were already plain dates.\n\n") +
    (widened > 0
      ? "Widened " + widened + " Stats formulas to cover all " + BOOK_ROWS + " Book rows" +
        (widenedCells.length ? " (" + widenedCells.join(", ") +
          (widened > widenedCells.length ? ", ..." : "") + ")" : "") + ".\n\n"
      : "No Stats formula needed widening.\n\n") +
    "Only those specific cells were touched - nothing else on the tab was written to.\n\n" +
    "Check today's numbers on the Stats tab now.",
    ui.ButtonSet.OK);
}
