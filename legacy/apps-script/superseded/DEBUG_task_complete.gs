/**
 * DEBUG - why Task Complete is not clearing
 *
 * Paste at the bottom of the rep's script. Save.
 * Tick at least one Task Complete box on the Daily Task tab (or leave the stuck ones ticked).
 * Then run  debugTaskComplete  from the editor's function dropdown.
 *
 * WHAT THIS IS FOR
 * onEdit is wrapped in a try/catch that swallows errors on purpose, so that a script fault
 * can never stop someone typing in the sheet. The cost is that a genuine failure looks
 * exactly like nothing happening - which is what we have been staring at.
 *
 * This runs the SAME completion logic with the catch removed, so the actual error comes back
 * with the line that threw. It reports everything it reads along the way, so even if it
 * succeeds we learn which part is not doing what we assume.
 *
 * READ-ONLY UNTIL THE LAST STEP. It reads and reports first, and only attempts the real
 * completion if you say yes to the prompt.
 */

function debugTaskComplete() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var bookSheet, dailyTaskSheet, repName;

  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf(" - Book") !== -1) { bookSheet = sheets[i]; repName = n.split(" - ")[0]; }
    if (n.indexOf(" - Daily Task") !== -1) dailyTaskSheet = sheets[i];
  }
  if (!bookSheet || !dailyTaskSheet) { ui.alert("Couldn't find the Book or Daily Task tab."); return; }

  var out = [];
  out.push("Rep: " + repName);
  out.push("Daily Task rows: " + dailyTaskSheet.getMaxRows() + ", Book rows: " + bookSheet.getMaxRows());

  // What does the script think is actionable?
  try {
    out.push("DT_ACTIONABLE_LAST_ROW = " + DT_ACTIONABLE_LAST_ROW);
  } catch (e) {
    out.push("DT_ACTIONABLE_LAST_ROW is NOT DEFINED - the script in this sheet is older than v31");
  }

  // Find ticked rows.
  var scanTo = Math.min(dailyTaskSheet.getMaxRows(), 700);
  var doneVals = dailyTaskSheet.getRange(1, 1, scanTo, 1).getValues();
  var ticked = [];
  for (var r = 0; r < scanTo; r++) if (doneVals[r][0] === true) ticked.push(r + 1);

  out.push("Ticked Task Complete boxes on rows: " + (ticked.length ? ticked.join(", ") : "NONE"));
  if (ticked.length === 0) {
    ui.alert("Debug Task Complete", out.join("\n") +
      "\n\nTick a box on the Daily Task tab first, then run this again.", ui.ButtonSet.OK);
    return;
  }

  var testRow = ticked[0];
  out.push("");
  out.push("--- examining row " + testRow + " ---");

  var matchRow = dailyTaskSheet.getRange(testRow, 2).getValue();
  var matchFormula = dailyTaskSheet.getRange(testRow, 2).getFormula();
  out.push("Match Row cell (col B) value: " + JSON.stringify(matchRow));
  out.push("Match Row cell formula: " + (matchFormula || "(none)"));

  if (matchRow === "" || matchRow === null || isNaN(matchRow)) {
    ui.alert("Debug Task Complete", out.join("\n") +
      "\n\nTHIS IS THE PROBLEM: the hidden Match Row cell is empty or not a number, so the " +
      "script has no idea which Book row this task belongs to and stops there.\n\n" +
      "Fix: run Step 3 (Rebuild Daily Task Tab) on this sheet.", ui.ButtonSet.OK);
    return;
  }

  out.push("");
  out.push("--- Book row " + matchRow + " ---");
  var labels = ["A ID", "B Handle", "D Roobet", "E Status", "I LastContact", "J NextFollowUp",
                "T Attempts", "W VIPTeamDate", "X VIPTeamCount", "AA VIPTransDate",
                "AB VIPTransAttempts", "AC VIPTeam"];
  var cols = [1, 2, 4, 5, 9, 10, 20, 23, 24, 27, 28, 29];
  for (var c = 0; c < cols.length; c++) {
    var cell = bookSheet.getRange(matchRow, cols[c]);
    var v = cell.getValue();
    var f = cell.getFormula();
    out.push(labels[c] + ": value=" + JSON.stringify(String(v)) + (f ? "  formula=" + f : ""));
  }

  var proceed = ui.alert("Debug Task Complete",
    out.join("\n") + "\n\n\nRun the real completion for this row now, with errors shown " +
      "instead of hidden?", ui.ButtonSet.YES_NO);
  if (proceed !== ui.Button.YES) return;

  // The real thing, uncaught.
  var result;
  try {
    logCompletion_(bookSheet, ss, repName, matchRow);
    dailyTaskSheet.getRange(testRow, 1).setValue(false);
    result = "COMPLETED WITHOUT ERROR. The box on row " + testRow + " has been unticked.\n\n" +
      "So the logic works when run directly. That means onEdit itself is not firing - most " +
      "likely the script needs re-authorising in this sheet, or an older copy of onEdit is " +
      "still in the project.";
  } catch (err) {
    result = "IT THREW. This is the error that has been hidden:\n\n" +
      err.message + "\n\n" + (err.stack ? err.stack.split("\n").slice(0, 6).join("\n") : "");
  }

  ui.alert("Result", result, ui.ButtonSet.OK);
}
