/**
 * Working out what "today" means for a given person.
 *
 * Every rep has their own time zone. A rep in Johannesburg starting at 7am is
 * on a different calendar day to one in Manila, and both differ from the
 * server. Getting this wrong is what made the spreadsheet stamp yesterday's
 * date on this morning's work, so it is handled in one place and used
 * everywhere.
 *
 * Timestamps are always stored UTC. These helpers translate between that and a
 * person's local day.
 */

/** The calendar date (YYYY-MM-DD) an instant falls on, in this person's zone. */
export function ymdInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant);
}

/** The instant that midnight-tonight-just-gone was, in this person's zone. */
export function startOfDayUtc(timeZone: string, now: Date = new Date()): Date {
  return wallTimeToUtc(`${ymdInZone(now, timeZone)}T00:00:00`, timeZone);
}

/** The instant that midnight-tonight-coming will be, in this person's zone. */
export function endOfDayUtc(timeZone: string, now: Date = new Date()): Date {
  const start = startOfDayUtc(timeZone, now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Midnight N days ahead, in this person's zone. */
export function startOfDayPlusUtc(
  timeZone: string,
  days: number,
  now: Date = new Date()
): Date {
  const start = startOfDayUtc(timeZone, now);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Takes a wall-clock time as it would read on a clock in `timeZone`, and
 * returns the actual UTC instant.
 *
 * Doing this without a date library means measuring the zone's offset at that
 * moment and subtracting it - which handles daylight saving correctly, because
 * the offset is measured on the day in question rather than assumed.
 */
function wallTimeToUtc(wallTime: string, timeZone: string): Date {
  const naive = new Date(`${wallTime}Z`); // read as if it were UTC
  const asZone = new Date(naive.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asZone.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - offset);
}

/** "Monday, 7 August" in this person's zone. */
export function formatToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);
}

/** A short date for a table cell. */
export function formatDate(value: string | null, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(value));
}

/** "7 Aug, 14:32" - for timeline entries, where the time of day matters. */
export function formatDateTime(value: string | null, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

/**
 * "3 days ago", "Today", "in 2 days" - measured in whole days as this person
 * experiences them, not in 24-hour blocks.
 */
export function relativeDays(
  value: string | null,
  timeZone: string,
  now: Date = new Date()
): { days: number; label: string } | null {
  if (!value) return null;
  const then = startOfDayUtc(timeZone, new Date(value));
  const today = startOfDayUtc(timeZone, now);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);

  if (days === 0) return { days, label: "Today" };
  if (days === 1) return { days, label: "Yesterday" };
  if (days > 1) return { days, label: `${days} days ago` };
  if (days === -1) return { days, label: "Tomorrow" };
  return { days, label: `In ${Math.abs(days)} days` };
}
