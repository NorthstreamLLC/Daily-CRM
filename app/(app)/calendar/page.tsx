import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/queries";
import { getCalendarMonth, type CalendarDay, type CalendarItem } from "@/lib/calendar";
import { EmptyState, cn } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, List } from "@/components/icons";
import { AddMeeting } from "./AddMeeting";
import { DeleteMeeting } from "./DeleteMeeting";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(ymd: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

/**
 * CALENDAR.
 *
 * Follow-ups are computed from each player's cadence - the same rule the queue
 * uses, so the two can never disagree. Meetings are the rows you typed in.
 * Month view answers "what does my month look like"; list view is the same
 * data as a plain agenda for working down.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const one = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const view = one("view") === "list" ? "list" : "month";
  const month = await getCalendarMonth(me, one("month"));

  const selectedDay =
    one("day") && month.days.has(one("day")!) ? one("day")! : undefined;
  const selected = selectedDay ? month.days.get(selectedDay) : undefined;

  // The agenda: every non-empty day this month, today onward first.
  const agenda = Array.from(month.days.values())
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.ymd.localeCompare(b.ymd));

  const qs = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      month: month.monthYmd.slice(0, 7),
      view: view === "list" ? "list" : undefined,
      day: selectedDay,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/calendar?${sp.toString()}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Calendar</h1>
          <p className="mt-0.5 text-body text-ink-muted">
            Scheduled follow-ups and your own meetings, in {me.timezone.replace("_", " ")}.
          </p>
        </div>
        <AddMeeting defaultDate={selectedDay ?? month.todayYmd} />
      </div>

      {/* Month navigation + view switch */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={qs({ month: month.prev, day: undefined })}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-control
                       border border-line-strong bg-surface text-ink-muted
                       transition-colors duration-fast hover:bg-sunken hover:text-ink"
          >
            <ChevronLeft size={15} />
          </Link>
          <h2 className="min-w-[150px] px-2 text-center text-h3 font-semibold text-ink">
            {month.label}
          </h2>
          <Link
            href={qs({ month: month.next, day: undefined })}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-control
                       border border-line-strong bg-surface text-ink-muted
                       transition-colors duration-fast hover:bg-sunken hover:text-ink"
          >
            <ChevronRight size={15} />
          </Link>
          <Link
            href={qs({ month: month.todayYmd.slice(0, 7), day: month.todayYmd })}
            className="ml-2 rounded-control border border-line-strong bg-surface px-2.5 py-1.5
                       text-small font-medium text-ink-muted transition-colors duration-fast
                       hover:bg-sunken hover:text-ink"
          >
            Today
          </Link>
        </div>

        <div className="flex rounded-control border border-line-strong bg-surface p-0.5">
          {(["month", "list"] as const).map((v) => (
            <Link
              key={v}
              href={qs({ view: v === "list" ? "list" : undefined })}
              aria-current={view === v ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-small font-medium",
                "transition-colors duration-fast",
                view === v
                  ? "bg-accent text-white btn-on-accent"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              {v === "month" ? <CalendarIcon size={13} /> : <List size={13} />}
              {v === "month" ? "Month" : "List"}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <>
          {/* Grid */}
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="grid grid-cols-7 border-b border-line bg-sunken">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-label font-medium uppercase
                             tracking-wide text-ink-subtle"
                >
                  {d}
                </div>
              ))}
            </div>

            {month.weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-line last:border-0">
                {week.map((day, di) =>
                  day === null ? (
                    <div key={di} className="min-h-[76px] bg-sunken/40 sm:min-h-[96px]" />
                  ) : (
                    <DayCell
                      key={day.ymd}
                      day={day}
                      isToday={day.ymd === month.todayYmd}
                      isSelected={day.ymd === selectedDay}
                      href={qs({ day: day.ymd })}
                    />
                  )
                )}
              </div>
            ))}
          </div>

          {/* Day drill-down */}
          {selected && (
            <section className="mt-5">
              <h3 className="mb-2.5 text-h3 font-semibold text-ink">
                {dayLabel(selected.ymd)}
                <span className="tabular ml-2 text-small font-normal text-ink-subtle">
                  {selected.items.length}{" "}
                  {selected.items.length === 1 ? "item" : "items"}
                </span>
              </h3>
              {selected.items.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon size={18} />}
                  title="Nothing on this day"
                  body="No follow-ups land here and you haven't added a meeting."
                />
              ) : (
                <ItemList items={selected.items} />
              )}
            </section>
          )}
        </>
      ) : (
        /* List view - the same month as a plain agenda */
        <div className="space-y-5">
          {agenda.length === 0 ? (
            <EmptyState
              icon={<List size={18} />}
              title="Nothing scheduled this month"
              body="Follow-ups land here as players become due; meetings appear when you add them."
            />
          ) : (
            agenda.map((day) => (
              <section key={day.ymd}>
                <h3
                  className={cn(
                    "mb-2 text-small font-semibold",
                    day.ymd === month.todayYmd ? "text-accent" : "text-ink"
                  )}
                >
                  {dayLabel(day.ymd)}
                  {day.ymd === month.todayYmd && " — today"}
                </h3>
                <ItemList items={day.items} />
              </section>
            ))
          )}
        </div>
      )}
    </>
  );
}

function DayCell({
  day,
  isToday,
  isSelected,
  href,
}: {
  day: CalendarDay;
  isToday: boolean;
  isSelected: boolean;
  href: string;
}) {
  const followups = day.items.filter((i) => i.kind === "followup").length;
  const meetings = day.items.length - followups;

  return (
    <Link
      href={href}
      aria-label={`${day.ymd}: ${followups} follow-ups, ${meetings} meetings`}
      className={cn(
        "flex min-h-[76px] flex-col gap-1 border-r border-line p-1.5 last:border-r-0",
        "transition-colors duration-fast sm:min-h-[96px] sm:p-2",
        isSelected ? "bg-accent-soft" : "hover:bg-sunken/60"
      )}
    >
      <span
        className={cn(
          "tabular flex h-6 w-6 items-center justify-center rounded-full text-small",
          isToday
            ? "bg-accent font-semibold text-white btn-on-accent"
            : "font-medium text-ink-muted"
        )}
      >
        {Number(day.ymd.slice(8, 10))}
      </span>

      {day.items.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {meetings > 0 && (
            <span className="truncate rounded bg-accent-soft px-1 py-0.5 text-caption font-medium text-accent">
              {meetings} {meetings === 1 ? "meeting" : "meetings"}
            </span>
          )}
          {followups > 0 && (
            <span className="truncate rounded bg-sunken px-1 py-0.5 text-caption text-ink-muted">
              {followups} due
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function ItemList({ items }: { items: CalendarItem[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {items.map((item) => (
        <div
          key={`${item.kind}-${item.id}`}
          className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0"
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              item.kind === "meeting" ? "bg-accent" : "bg-line-strong"
            )}
            aria-hidden="true"
          />

          {item.time && (
            <span className="tabular w-11 shrink-0 text-small font-medium text-ink">
              {item.time}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-ink">
              <span className="font-medium">{item.title}</span>
              {item.reference && (
                <span className="tabular ml-2 text-caption text-ink-subtle">
                  {item.reference}
                </span>
              )}
            </p>
            {item.detail && (
              <p className="truncate text-caption text-ink-subtle">{item.detail}</p>
            )}
          </div>

          {item.kind === "followup" ? (
            <Link
              href={`/book?q=${encodeURIComponent(item.reference ?? item.title)}`}
              className="shrink-0 text-small font-medium text-accent underline-offset-2 hover:underline"
            >
              Open
            </Link>
          ) : (
            <DeleteMeeting meetingId={item.id} title={item.title} />
          )}
        </div>
      ))}
    </div>
  );
}
