/**
 * RESET THE VIP CHECK-IN CLOCK
 *
 * Paste at the bottom of the rep's script. Save.
 * Run  resetVipClock  from the editor's function dropdown.
 *
 *
 * THE SITUATION
 * A VIP Transferred player gets a Day 1 / Day 2 / Day 3 check-in cadence. Those dates are
 * counted from the day they became VIP Transferred - not from when anyone actually spoke to
 * them. For these players that date is weeks old, so all three check-ins expired before
 * anybody worked the list. They show as "Day 3 URGENT" and are one completion away from
 * being auto-flagged "Should be Dead Lead", even though several are plainly mid-KYC.
 *
 * WHAT THIS DOES
 * For every player whose Status is currently VIP Transferred, it sets their VIP start date
 * to today and puts their attempt counter back to 0. Their Day 1 check-in becomes tomorrow,
 * Day 2 the day after, Day 3 the day after that. A clean run at them starting now.
 *
 * WHAT IT DOES NOT DO
 * Touches two cells per player: the VIP start date (AA) and the attempt count (AB). Nothing
 * else. No handles, statuses, notes, contact dates, wagers or FTD data. Players with any
 * other status are not looked at.
 *
 * Nobody gets auto-flagged as a dead lead off the back of check-ins that never happened.
 */

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
