import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/queries";
import { dayStartFromYmd, endOfDayUtc, startOfDayUtc, ymdInZone } from "@/lib/time";

export type CalendarItem = {
  kind: "followup" | "meeting";
  id: string;
  title: string;          // player handle, or the meeting title
  detail: string;         // status / next action, or meeting notes
  reference?: string;
  time?: string;          // "14:30" for meetings; follow-ups are all-day
  playerId?: string;
};

export type CalendarDay = {
  ymd: string;
  items: CalendarItem[];
};

export type CalendarMonth = {
  monthYmd: string;         // YYYY-MM-01
  label: string;            // "August 2026"
  prev: string;             // YYYY-MM for navigation
  next: string;
  todayYmd: string;
  /** Six rows of seven, Monday first. null = padding from adjacent months. */
  weeks: (CalendarDay | null)[][];
  days: Map<string, CalendarDay>;
};

function monthLabel(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * THE CALENDAR.
 *
 * The rule that matters: TODAY'S CELL IS THE QUEUE. It uses the exact same
 * conditions as the Today page - never contacted, follow-up arrived, or no
 * Roobet username - so the two can never disagree about what today holds.
 * An earlier version plotted only stored follow-up dates, which showed "1"
 * on a day the queue held five; that mismatch is the bug this shape prevents.
 *
 * Future days show the schedule: whoever's next follow-up lands on that day.
 * Past days show only meetings - a follow-up in the past is either done, or
 * overdue and therefore already counted in today's cell.
 */
export async function getCalendarMonth(
  me: Me,
  monthParam: string | undefined
): Promise<CalendarMonth> {
  const now = new Date();
  const todayYmd = ymdInZone(now, me.timezone);
  const ym = /^\d{4}-\d{2}$/.test(monthParam ?? "")
    ? (monthParam as string)
    : todayYmd.slice(0, 7);

  const monthStartYmd = `${ym}-01`;
  const nextMonthYmd = `${shiftMonth(ym, 1)}-01`;

  const rangeStart = dayStartFromYmd(monthStartYmd, me.timezone)!;
  const rangeEnd = dayStartFromYmd(nextMonthYmd, me.timezone)!;

  const startToday = startOfDayUtc(me.timezone, now).toISOString();
  const endToday = endOfDayUtc(me.timezone, now);

  const supabase = createClient();

  const monthIncludesToday = todayYmd >= monthStartYmd && todayYmd < nextMonthYmd;

  // The schedule window: strictly after today, inside this month.
  const scheduledStart = new Date(
    Math.max(rangeStart.getTime(), endToday.getTime())
  );

  const PLAYER_COLS =
    "id, handle, reference, status, next_action, next_followup_at, missing_roobet";

  const [{ data: dueNow }, { data: scheduled }, { data: meetings }] =
    await Promise.all([
      // Today: the queue, condition for condition the same as getDueNow.
      monthIncludesToday
        ? supabase
            .from("players_enriched")
            .select(PLAYER_COLS)
            .eq("owner_id", me.id)
            .or(`last_contact_at.is.null,last_contact_at.lt.${startToday}`)
            .or(
              `last_contact_at.is.null,next_followup_at.lte.${endToday.toISOString()},missing_roobet.is.true`
            )
            .limit(1000)
        : Promise.resolve({ data: [] as never[] }),
      // Future days: whoever's follow-up lands there, username or not.
      scheduledStart < rangeEnd
        ? supabase
            .from("players_enriched")
            .select(PLAYER_COLS)
            .eq("owner_id", me.id)
            .gt("next_followup_at", scheduledStart.toISOString())
            .lt("next_followup_at", rangeEnd.toISOString())
            .limit(2000)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("meetings")
        .select("id, title, notes, starts_at, player_id")
        .eq("user_id", me.id)
        .gte("starts_at", rangeStart.toISOString())
        .lt("starts_at", rangeEnd.toISOString())
        .order("starts_at")
        .limit(500),
    ]);

  const days = new Map<string, CalendarDay>();
  const dayOf = (iso: string) => ymdInZone(new Date(iso), me.timezone);
  const at = (ymd: string) => {
    let day = days.get(ymd);
    if (!day) {
      day = { ymd, items: [] };
      days.set(ymd, day);
    }
    return day;
  };

  for (const m of meetings ?? []) {
    at(dayOf(m.starts_at)).items.push({
      kind: "meeting",
      id: m.id,
      title: m.title,
      detail: m.notes ?? "",
      time: new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: me.timezone,
      }).format(new Date(m.starts_at)),
      playerId: m.player_id ?? undefined,
    });
  }

  const pushPlayer = (ymd: string, p: {
    id: string;
    handle: string;
    reference: string;
    status: string;
    next_action: string;
    missing_roobet: boolean;
  }) => {
    at(ymd).items.push({
      kind: "followup",
      id: p.id,
      title: p.handle,
      detail: p.missing_roobet
        ? `${p.status} — chase the Roobet username`
        : `${p.status} — ${p.next_action}`,
      reference: p.reference,
      playerId: p.id,
    });
  };

  // Today = the queue, exactly.
  for (const p of dueNow ?? []) pushPlayer(todayYmd, p);

  // The future = the schedule. Anyone already in today's cell is skipped so a
  // player never appears twice in one month.
  const inToday = new Set((dueNow ?? []).map((p) => p.id));
  for (const p of scheduled ?? []) {
    if (!p.next_followup_at || inToday.has(p.id)) continue;
    pushPlayer(dayOf(p.next_followup_at), p);
  }

  // Meetings first (they have times), then follow-ups alphabetically.
  days.forEach((day) =>
    day.items.sort((a, b) =>
      a.kind !== b.kind
        ? a.kind === "meeting"
          ? -1
          : 1
        : (a.time ?? a.title).localeCompare(b.time ?? b.title)
    )
  );

  // Build the grid: Monday-first weeks with padding.
  const first = new Date(`${monthStartYmd}T12:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const firstWeekday = (first.getUTCDay() + 6) % 7; // Monday = 0

  const cells: (CalendarDay | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${ym}-${String(d).padStart(2, "0")}`;
    cells.push(days.get(ymd) ?? { ymd, items: [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    monthYmd: monthStartYmd,
    label: monthLabel(monthStartYmd),
    prev: shiftMonth(ym, -1),
    next: shiftMonth(ym, 1),
    todayYmd,
    weeks,
    days,
  };
}
