import { redirect } from "next/navigation";
import { Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { BarChart, Flame, Target, TrendingUp, UserCheck, Wallet } from "@/components/icons";
import { canSeeWager, getMe, getTargets } from "@/lib/queries";
import {
  currentCycle,
  getFunnelStages,
  getWagerCycleReport,
  type CycleRow,
} from "@/lib/admin";
import { formatDate, ymdInZone } from "@/lib/time";
import { RangePicker } from "../RangePicker";
import { ViewAs } from "../ViewAs";
import { DepositTabs } from "./DepositTabs";
import { RefreshWager } from "./RefreshWager";
import { WagerTable } from "./WagerTable";
import { createClient } from "@/lib/supabase/server";
import {
  getActivity,
  getFunnel,
  getRecentDeposits,
  getRecords,
  getSourcePerformance,
  getTrend,
  resolveRange,
  trendDays,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ Pieces */

function Metric({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "success" | "danger";
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <p className="text-label font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={cn(
          "tabular mt-1.5 text-metric font-semibold",
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-caption text-ink-subtle">{sub}</p>}
    </Card>
  );
}

function FunnelBar({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of: number;
  tone: "accent" | "success";
}) {
  const pct = of > 0 ? (value / of) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-small font-medium text-ink">{label}</span>
        <span className="tabular text-small text-ink-muted">
          {value.toLocaleString()}
          {of > 0 && <span className="text-ink-subtle"> · {pct.toFixed(0)}%</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <div
          className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-accent")}
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Activity chart, drawn as plain SVG.
 *
 * A charting library would be roughly 80kB of JavaScript to draw thirty
 * rectangles. This renders on the server, works with JavaScript disabled, and
 * every bar carries a title for screen readers and hover.
 */
function TrendChart({ days, timezone }: { days: { date: string; leads: number; ftd: number }[]; timezone: string }) {
  const max = Math.max(1, ...days.map((d) => d.leads));
  const width = 100;
  const gap = 0.55;
  const barWidth = (width - gap * (days.length - 1)) / days.length;

  const label = (ymd: string) =>
    ymd
      ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
          .format(new Date(`${ymd}T12:00:00Z`))
      : "";

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} 34`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Leads added per day over the last ${days.length} days`}
      >
        {days.map((d, i) => {
          const h = (d.leads / max) * 30;
          return (
            <rect
              key={d.date}
              x={i * (barWidth + gap)}
              y={32 - h}
              width={barWidth}
              height={Math.max(h, d.leads > 0 ? 0.8 : 0)}
              rx={0.4}
              className={d.ftd > 0 ? "fill-success" : "fill-accent"}
              opacity={d.leads > 0 ? 1 : 0.25}
            >
              <title>
                {label(d.date)}: {d.leads} leads, {d.ftd} deposits
              </title>
            </rect>
          );
        })}
        <line x1="0" y1="32.3" x2={width} y2="32.3" className="stroke-line" strokeWidth="0.35" />
      </svg>

      <div className="mt-1.5 flex justify-between text-caption text-ink-subtle">
        <span>{label(days[0]?.date ?? "")}</span>
        <span>Peak {max} in a day</span>
        <span>{label(days[days.length - 1]?.date ?? "")}</span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-success" /> Day produced a deposit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Leads only
        </span>
        <span>Counted in {timezone.replace("_", " ")}.</span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- Page */

export default async function StatsPage({
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

  // Today is the default - the question a rep asks most is "how am I doing
  // right now", not "how was the last 30 days".
  const range = resolveRange(
    { period: one("period"), from: one("from"), to: one("to") },
    me.timezone,
    "today"
  );

  /* An admin may look at any rep's numbers; a rep is pinned to their own.
     Without this an admin's Stats page was permanently empty - every figure
     scoped to a person who carries no players. */
  const isAdmin = me.role === "admin";
  const ownerId = (isAdmin ? one("owner") : "") || me.id;
  const viewingSomeoneElse = ownerId !== me.id;

  const supabase = createClient();

  /* WAGER DOES NOT FOLLOW THE RANGE PICKER, and now says so.

     Roobet is only ever asked for whole UTC windows, so "last 30 days" has no
     wager figure at all. The old version mapped the picker onto the nearest
     real period and then printed the PICKER's label over the period's numbers -
     so a column headed "Last 30 days" held this month's figures, which on the
     3rd is three days of money under a thirty-day heading. Isac read it as
     stale data. It was not stale; it was mislabelled, which is worse, because
     a stale number gets refreshed and a mislabelled one gets believed.

     So the section is now pinned to the two windows the business actually
     runs on, each named on screen: the calendar month, and the leaderboard
     cycle that runs the 16th to the 15th. */
  const nowUtc = new Date();
  const monthStart = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1)
  );
  const monthKey = monthStart.toISOString().slice(0, 10);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(monthStart);
  const cycle = currentCycle(nowUtc);

  /* Started, not awaited. Only getRecords needs a number out of this, and
     awaiting it on its own line made all eight queries below queue behind one
     small lookup - an extra round trip to the database on every visit. */
  const targetsPromise = getTargets(me, ownerId);
  const recordsPromise = targetsPromise.then((t) =>
    getRecords(ownerId, me.timezone, t.activeLeads)
  );

  const [
    showWager,
    targets,
    funnel,
    activity,
    sources,
    trend,
    records,
    stages,
    wager,
    recentDeposits,
    teamRes,
    ownerRes,
  ] = await Promise.all([
      canSeeWager(me),
      targetsPromise,
      getFunnel(ownerId, range),
      getActivity(ownerId, range),
      getSourcePerformance(ownerId, range),
      getTrend(ownerId, me.timezone, trendDays(range)),
      recordsPromise,
      /* Scoped to whoever is being viewed. The comment that used to be here
         claimed RLS did this - it does not, because the counting function is
         security definer, and definer is precisely what bypasses RLS. This
         page showed Prime the company's 244 players when he has one. */
      getFunnelStages(ownerId),
      /* Caught rather than thrown. A missing migration here used to take the
         whole Stats page down with a digest number and nothing else - the
         wager table is one section, and one section failing should cost one
         section. */
      getWagerCycleReport(monthKey, monthKey, cycle.start, ownerId).catch(
        (e: Error) => ({ error: e.message }) as { error: string }
      ),
      getRecentDeposits(ownerId, me.timezone, cycle.startDate, cycle.endDate),
      isAdmin
        ? supabase.from("users").select("id, name").eq("active", true).order("name")
        : Promise.resolve({ data: null }),
      viewingSomeoneElse
        ? supabase.from("users").select("name").eq("id", ownerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const team = (teamRes.data ?? []) as { id: string; name: string }[];
  const ownerName = (ownerRes.data as { name: string } | null)?.name ?? null;

  const bookTotal = stages.reduce((sum, s) => sum + s.playerCount, 0);

  const conversion = funnel.leads > 0 ? funnel.reachedFtd / funnel.leads : 0;
  const isToday = range.key === "today";

  /* What each depositor has wagered since, taken from the rows already fetched
     above rather than a second query. Keyed on the lowercased username because
     that is the only thing the two sides share - a wager row belongs to a
     Roobet name, not to a player id.

     Attached here rather than passed as a Map: the deposit list is a client
     component, and everything crossing that boundary is serialised. Plain
     values travel; cleverness does not. */
  const wagerRows: CycleRow[] = "error" in wager ? [] : wager.rows;
  const wagerByUsername = new Map(
    wagerRows.map((r) => [r.username.trim().toLowerCase(), r] as const)
  );

  const depositRows = recentDeposits.map((d) => {
    const w = d.roobetUsername
      ? wagerByUsername.get(d.roobetUsername.toLowerCase())
      : undefined;
    return {
      ...d,
      depositedLabel: formatDate(d.depositedAt, me.timezone),
      wageredMonth: w?.monthWagered,
      wageredCycle: w?.cycleWagered,
    };
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">
            {viewingSomeoneElse && ownerName
              ? `${ownerName}'s performance`
              : "Your performance"}
          </h1>
          <p className="mt-0.5 text-body text-ink-muted">
            Counted from what was actually logged, so a correction removes itself.
          </p>
        </div>
        {isAdmin && (
          <ViewAs
            team={team}
            current={ownerId}
            meId={me.id}
            basePath="/stats"
            keep={["period", "from", "to"]}
          />
        )}
      </div>

      <RangePicker range={range} today={ymdInZone(new Date(), me.timezone)} />

      {/* What you did in the window */}
      <section className="mb-8">
        <SectionHeader
          title={isToday ? "Today so far" : range.label}
          hint="Work logged inside this window, whenever the player was first added."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Leads added"
            value={activity.leads.toLocaleString()}
            sub={
              isToday && targets.activeLeads > 0
                ? activity.leads >= targets.activeLeads
                  ? "Target met"
                  : `${targets.activeLeads - activity.leads} to target`
                : undefined
            }
            tone={
              isToday && targets.activeLeads > 0 && activity.leads >= targets.activeLeads
                ? "success"
                : undefined
            }
            icon={<UserCheck size={14} />}
          />
          <Metric
            label="VIP transfers"
            value={activity.vip.toLocaleString()}
            sub={`${records.vipThisMonth.toLocaleString()} in ${monthLabel} · ${records.totalVip.toLocaleString()} all time`}
            tone={
              isToday && targets.vipTransfers > 0 && activity.vip >= targets.vipTransfers
                ? "success"
                : undefined
            }
            icon={<TrendingUp size={14} />}
          />
          {/* The monthly figure sits here rather than behind the date picker.
              "How many deposits this month" is the question asked in a Monday
              meeting, and it should not need a filter set to answer it. One
              player counts once, whatever route they took to get there - see
              the note on tally() in lib/stats. */}
          <Metric
            label="First deposits"
            value={activity.ftd.toLocaleString()}
            sub={`${records.ftdsThisMonth.toLocaleString()} in ${monthLabel} · ${records.totalFtds.toLocaleString()} all time`}
            tone={
              isToday && targets.ftds > 0 && activity.ftd >= targets.ftds ? "success" : undefined
            }
            icon={<Wallet size={14} />}
          />
          <Metric
            label="Daily tasks done"
            value={activity.touches.toLocaleString()}
            sub="Ticked off on Today"
            icon={<Target size={14} />}
          />
        </div>
      </section>

      {/* Funnel */}
      <section className="mb-8">
        <SectionHeader
          title="Conversion funnel"
          hint="Of the leads added in this window, how far they eventually got. Milestones are dated when they happened, so later status edits don't rewrite history."
        />
        {funnel.leads === 0 ? (
          <EmptyState
            icon={<BarChart size={18} />}
            title={`No new leads in ${range.label.toLowerCase()}`}
            body="Pick a longer period, or add players and come back once there's something to measure."
          />
        ) : (
          <Card>
            <div className="space-y-3.5">
              <FunnelBar label="Leads added" value={funnel.leads} of={funnel.leads} tone="accent" />
              <FunnelBar
                label="Reached VIP transfer"
                value={funnel.reachedVip}
                of={funnel.leads}
                tone="accent"
              />
              <FunnelBar
                label="Made a first deposit"
                value={funnel.reachedFtd}
                of={funnel.leads}
                tone="success"
              />
              <FunnelBar
                label="Still active"
                value={funnel.stillActive}
                of={funnel.leads}
                tone="success"
              />
            </div>

            <p className="mt-4 border-t border-line pt-3 text-small text-ink-muted">
              {funnel.reachedVip > 0 && funnel.reachedFtd < funnel.reachedVip ? (
                <>
                  {funnel.reachedVip - funnel.reachedFtd} of these VIP transfers never
                  deposited — that gap is usually the biggest single win available.
                </>
              ) : funnel.reachedVip === 0 ? (
                <>Nobody from this window reached VIP transfer yet.</>
              ) : (
                <>Every VIP transfer from this window went on to deposit.</>
              )}{" "}
              Overall conversion {(conversion * 100).toFixed(1)}%.
            </p>
          </Card>
        )}
      </section>

      {/* Trend */}
      <section className="mb-8">
        <SectionHeader title={`Last ${trend.length} days`} hint="Leads added each day." />
        <Card>
          <TrendChart days={trend} timezone={me.timezone} />
        </Card>
      </section>

      {/* Where the book stands right now */}
      <section className="mb-8">
        <SectionHeader
          title="Your book right now"
          hint="Everyone you own, by stage. Not affected by the period above — this is the present, not a window."
        />
        {bookTotal === 0 ? (
          <EmptyState
            icon={<BarChart size={18} />}
            title="Your book is empty"
            body="Add players and this becomes a live picture of your pipeline."
          />
        ) : (
          <Card>
            <div className="space-y-3">
              {stages
                .filter((s) => s.playerCount > 0)
                .map((s) => {
                  const pct = (s.playerCount / bookTotal) * 100;
                  return (
                    <div key={s.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="text-small font-medium text-ink">{s.name}</span>
                        <span className="tabular text-small text-ink-muted">
                          {s.playerCount.toLocaleString()}
                          <span className="text-ink-subtle"> · {pct.toFixed(0)}%</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-sunken">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            s.is_ftd ? "bg-success" : s.is_dead ? "bg-line-strong" : "bg-accent"
                          )}
                          style={{ width: `${Math.max(pct, 1.5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            <p className="mt-4 border-t border-line pt-3 text-caption text-ink-subtle">
              {bookTotal.toLocaleString()} players. Green stages have deposited; grey is
              dead.
            </p>
          </Card>
        )}
      </section>

      {/* Your players' wager - admins always, reps only if the setting says so.

          A rep who can see a player wagered $400,000 has a number to negotiate
          with, and the conversation stops being about the work. Admin >
          Settings > "Show wager figures to reps" turns it back on. */}
      {showWager && (
      <section className="mb-8">
        <SectionHeader
          title="What your players wagered"
          hint={`Weighted wager from your book, asked of Roobet as whole UTC windows. Two of them: ${monthLabel} so far, and the leaderboard cycle running ${cycle.label}. Neither follows the date picker above — they cannot.`}
          action={
            <div className="flex items-start gap-4">
              {!("error" in wager) && wager.rows.length > 0 && (
                <a
                  href={`/api/wager-report?${new URLSearchParams({
                    period: monthKey.slice(0, 7),
                    cycle: cycle.start,
                    owner: ownerId,
                  }).toString()}`}
                  className="text-small font-medium text-accent underline-offset-2 hover:underline"
                >
                  Export CSV
                </a>
              )}
              {isAdmin && <RefreshWager />}
            </div>
          }
        />
        {"error" in wager ? (
          <EmptyState
            icon={<Wallet size={18} />}
            title="The wager table could not load"
            body={wager.error}
          />
        ) : wager.rows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} />}
            title="No wager recorded for this book yet"
            body="Wager appears once a player's Roobet username is filled in and the sync has run. Ask an admin if you expected figures here."
          />
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                label={`Wagered — ${monthLabel}`}
                value={
                  "$" +
                  wager.monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
                sub={`${wager.monthWagerers} of your players wagered`}
                icon={<Wallet size={14} />}
              />
              {/* The window commission is argued over. Named by its dates on
                  purpose - "this cycle" means two different things depending
                  on which side of the 16th you read it. */}
              <Metric
                label="Leaderboard cycle"
                value={
                  "$" +
                  wager.cycleTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
                sub={`${cycle.label} · ${wager.cycleWagerers} wagered`}
                icon={<Target size={14} />}
              />
              <Metric
                label="Average per wagering player"
                value={
                  "$" +
                  (wager.monthWagerers > 0
                    ? Math.round(wager.monthTotal / wager.monthWagerers)
                    : 0
                  ).toLocaleString()
                }
                sub={`Across ${monthLabel}`}
                icon={<TrendingUp size={14} />}
              />
            </div>

            {/* Nothing stored for the cycle at all. Said plainly rather than
                shown as a column of zeroes, which reads as "nobody wagered"
                and is a different claim entirely. */}
            {wager.cycleNeverFetched && (
              <p className="mb-3 rounded-control border border-warning bg-warning-soft px-3 py-2 text-small text-ink">
                No leaderboard figures stored for {cycle.label} yet.
                {isAdmin
                  ? " Press Refresh figures above — the first run fetches the past year of cycles."
                  : " Ask an admin to press Refresh figures on their Stats page."}
              </p>
            )}

            {/* Paged in the browser. Every row is already here - the report
                fetches the whole book in one call - so turning a page is a
                slice of an array rather than a round trip that re-runs eight
                other queries which have not changed. */}
            <WagerTable
              rows={wager.rows}
              monthLabel={monthLabel}
              cycleLabel={cycle.label}
              owner={viewingSomeoneElse ? ownerId : undefined}
            />
          </>
        )}
      </section>
      )}

      {/* WHO DEPOSITED, in either window.

          The card above says 14. This says which 14. A count on its own cannot
          be acted on or checked - and the mismatch that started this whole
          thread, a card reading 6 over a table showing 3, was only findable
          because someone happened to read both numbers at once.

          Two tabs, because there are two calendars here and they disagree for
          half of every month: the company reports on the calendar month, and
          Roobet pays on the 16th-to-15th cycle.

          Outside the wager gate on purpose. A first deposit is not a dollar
          figure, so a rep who may not see wager amounts should still see who
          deposited; only the money column is withheld. */}
      <section className="mb-8">
        <SectionHeader
          title="First deposits"
          hint="Newest first, counted from the activity log — the same source as the card above, so the two cannot drift apart."
        />
        {depositRows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} />}
            title="No first deposits in either window yet"
            body="A deposit lands here when a player is moved to First Deposit, or when the wager sync sees them playing and moves them to Active."
          />
        ) : (
          <DepositTabs
            rows={depositRows}
            monthLabel={monthLabel}
            cycleLabel={cycle.label}
            showWager={showWager}
            owner={viewingSomeoneElse ? ownerId : undefined}
          />
        )}
      </section>

      {/* Sources */}
      <section className="mb-8">
        <SectionHeader
          title="Where your deposits come from"
          hint="Ranked by conversion rate, not volume — the source producing the most leads is rarely the one producing the most deposits."
        />
        {sources.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={18} />}
            title="No sources recorded in this window"
            body="Set a source when you add a player and this table will show which ones are worth your time."
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <Th>Source</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">Deposits</Th>
                  <Th align="right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const tooSmall = s.leads < 10;
                  return (
                    <tr key={s.source} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-body font-medium text-ink">
                        {s.source}
                        {tooSmall && (
                          <span className="ml-2 text-caption font-normal text-ink-subtle">
                            too few to judge
                          </span>
                        )}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-body text-ink-muted">
                        {s.leads}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-body text-ink-muted">
                        {s.ftds}
                      </td>
                      <td
                        className={cn(
                          "tabular px-4 py-2.5 text-right text-body font-medium",
                          tooSmall
                            ? "text-ink-subtle"
                            : s.rate > 0
                            ? "text-success"
                            : "text-ink-muted"
                        )}
                      >
                        {(s.rate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Records */}
      <section>
        <SectionHeader title="Records" hint="All time, whatever window is selected above." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Current streak"
            value={records.currentStreak === 0 ? "—" : `${records.currentStreak} days`}
            sub={
              targets.activeLeads > 0
                ? `Hitting ${targets.activeLeads} leads a day · best ${records.longestStreak}`
                : "No daily target set"
            }
            icon={<Flame size={14} />}
          />
          <Metric
            label="Best day"
            value={records.bestDay ? String(records.bestDay.leads) : "—"}
            sub={records.bestDay ? `leads on ${records.bestDay.date}` : "Nothing logged yet"}
            icon={<Target size={14} />}
          />
          <Metric
            label="Best month"
            value={records.bestMonth ? String(records.bestMonth.leads) : "—"}
            sub={records.bestMonth ? `leads in ${records.bestMonth.label}` : "Nothing logged yet"}
            icon={<Target size={14} />}
          />
          <Metric
            label="VIP transfers all time"
            value={records.totalVip.toLocaleString()}
            sub={
              records.totalLeads > 0
                ? `${((records.totalVip / records.totalLeads) * 100).toFixed(0)}% of every lead`
                : "—"
            }
            icon={<TrendingUp size={14} />}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Leads all time"
            value={records.totalLeads.toLocaleString()}
            sub="Since you started"
            icon={<UserCheck size={14} />}
          />
          <Metric
            label="Deposits all time"
            value={records.totalFtds.toLocaleString()}
            sub={
              records.totalLeads > 0
                ? `${((records.totalFtds / records.totalLeads) * 100).toFixed(1)}% lifetime rate`
                : "—"
            }
            icon={<Wallet size={14} />}
          />
          <Metric
            label="Best week"
            value={records.bestWeek ? String(records.bestWeek.leads) : "—"}
            sub={records.bestWeek?.label ?? "Nothing logged yet"}
            icon={<Target size={14} />}
          />
          <Metric
            label="Longest streak"
            value={records.longestStreak === 0 ? "—" : `${records.longestStreak} days`}
            sub="Consecutive days on target"
            icon={<Flame size={14} />}
          />
        </div>
      </section>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}
