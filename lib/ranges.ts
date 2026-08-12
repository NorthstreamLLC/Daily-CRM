import {
  dayStartFromYmd,
  endOfDayUtc,
  startOfDayPlusUtc,
  startOfDayUtc,
  ymdInZone,
} from "@/lib/time";

/**
 * Date ranges, kept free of any database imports.
 *
 * The picker is a client component and needs the preset list and the resolved
 * range, so this cannot live alongside the queries - importing that module into
 * the browser bundle drags `next/headers` with it and the build fails.
 */

export type RangeKey =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "ytd"
  | "all"
  | "custom";

export type DateRange = {
  key: RangeKey;
  /** Inclusive start instant, or null for all time. */
  start: Date | null;
  /** Exclusive end instant, or null for "up to now". */
  end: Date | null;
  label: string;
  /** YYYY-MM-DD, for populating the date inputs. */
  from: string;
  to: string;
};

export const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "This month" },
  { key: "ytd", label: "This year" },
  { key: "all", label: "All time" },
];

export function prettyDate(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

/**
 * Works out which window a page is looking at.
 *
 * Everything resolves against the viewer's own time zone, so "today" for a rep
 * in Manila is their Monday, not the server's. A custom range wins over a
 * preset when both are present - which is what happens when someone picks dates
 * while a preset chip is still highlighted.
 */
export function resolveRange(
  params: { period?: string; from?: string; to?: string },
  timeZone: string,
  fallback: RangeKey = "today"
): DateRange {
  const now = new Date();
  const todayYmd = ymdInZone(now, timeZone);

  const build = (
    key: RangeKey,
    start: Date | null,
    end: Date | null,
    label: string
  ): DateRange => ({
    key,
    start,
    end,
    label,
    from: start ? ymdInZone(start, timeZone) : "",
    to: end ? ymdInZone(new Date(end.getTime() - 1), timeZone) : todayYmd,
  });

  // Custom range first - if someone typed dates, that is what they want.
  if (params.from && params.to) {
    const start = dayStartFromYmd(params.from, timeZone);
    const endStart = dayStartFromYmd(params.to, timeZone);

    if (start && endStart) {
      // The end date is inclusive, so run to midnight the following day.
      const end = new Date(endStart.getTime() + 86_400_000);
      if (end > start) {
        return build(
          "custom",
          start,
          end,
          params.from === params.to
            ? prettyDate(params.from)
            : `${prettyDate(params.from)} – ${prettyDate(params.to)}`
        );
      }
    }
  }

  const key = (RANGE_PRESETS.find((p) => p.key === params.period)?.key ??
    fallback) as RangeKey;
  const endToday = endOfDayUtc(timeZone, now);

  switch (key) {
    case "today":
      return build("today", startOfDayUtc(timeZone, now), endToday, "Today");
    case "7d":
      return build("7d", startOfDayPlusUtc(timeZone, -6, now), endToday, "Last 7 days");
    case "30d":
      return build("30d", startOfDayPlusUtc(timeZone, -29, now), endToday, "Last 30 days");
    case "90d":
      return build("90d", startOfDayPlusUtc(timeZone, -89, now), endToday, "Last 90 days");
    case "mtd": {
      const day = Number(todayYmd.slice(8, 10));
      return build("mtd", startOfDayPlusUtc(timeZone, -(day - 1), now), endToday, "This month");
    }
    case "ytd": {
      const start = dayStartFromYmd(`${todayYmd.slice(0, 4)}-01-01`, timeZone);
      return build("ytd", start, endToday, "This year");
    }
    default:
      return build("all", null, null, "All time");
  }
}

/** How many days of history a chart should show for a given range. */
export function trendDays(range: DateRange): number {
  if (!range.start) return 90;
  const span = Math.ceil(
    ((range.end ?? new Date()).getTime() - range.start.getTime()) / 86_400_000
  );
  return Math.min(90, Math.max(14, span));
}
