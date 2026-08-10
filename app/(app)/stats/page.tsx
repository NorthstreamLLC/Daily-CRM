import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { BarChart, Flame, Target, TrendingUp, UserCheck, Wallet } from "@/components/icons";
import { getMe, getTargets } from "@/lib/queries";
import {
  PERIOD_LABEL,
  getFunnel,
  getRecords,
  getSourcePerformance,
  getTrend,
  periodStart,
  type Period,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

const PERIODS: Period[] = ["7d", "30d", "90d", "mtd", "all"];

/* ------------------------------------------------------------------- Funnel */

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
      <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "success" ? "bg-success" : "bg-accent"
          )}
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Chart */

/**
 * Activity chart, drawn as plain SVG.
 *
 * A charting library would be roughly 80kB of JavaScript to draw thirty
 * rectangles. This renders on the server, works with JavaScript disabled, and
 * carries a table underneath it for screen readers.
 */
function TrendChart({
  days,
  timezone,
}: {
  days: { date: string; leads: number; ftd: number }[];
  timezone: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.leads));
  const width = 100;
  const gap = 0.6;
  const barWidth = (width - gap * (days.length - 1)) / days.length;

  const label = (ymd: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(`${ymd}T12:00:00Z`));

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} 34`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={`Leads added per day over the last ${days.length} days`}
      >
        {days.map((d, i) => {
          const h = (d.leads / max) * 30;
          return (
            <g key={d.date}>
              <rect
                x={i * (barWidth + gap)}
                y={32 - h}
                width={barWidth}
                height={Math.max(h, d.leads > 0 ? 0.8 : 0)}
                rx={0.5}
                className="fill-accent"
                opacity={d.ftd > 0 ? 1 : 0.55}
              >
                <title>
                  {label(d.date)}: {d.leads} leads, {d.ftd} deposits
                </title>
              </rect>
            </g>
          );
        })}
        <line x1="0" y1="32.4" x2={width} y2="32.4" className="stroke-line" strokeWidth="0.4" />
      </svg>

      <div className="mt-1.5 flex justify-between text-caption text-ink-subtle">
        <span>{label(days[0]?.date ?? "")}</span>
        <span>Peak {max}</span>
        <span>{label(days[days.length - 1]?.date ?? "")}</span>
      </div>

      <p className="mt-2 text-caption text-ink-subtle">
        Darker bars are days that also produced a deposit. Days are counted in{" "}
        {timezone.replace("_", " ")}.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- Page */

function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <p className="text-label font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="tabular mt-1.5 text-metric font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-caption text-ink-subtle">{sub}</p>}
    </Card>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const raw = searchParams.period;
  const requested = (Array.isArray(raw) ? raw[0] : raw) as Period;
  const period: Period = PERIODS.includes(requested) ? requested : "30d";
  const start = periodStart(period, me.timezone);

  const targets = await getTargets(me);

  const [funnel, sources, trend, records] = await Promise.all([
    getFunnel(me.id, start),
    getSourcePerformance(me.id, start),
    getTrend(me.id, me.timezone, 30),
    getRecords(me.id, me.timezone, targets.activeLeads),
  ]);

  const conversion = funnel.leads > 0 ? funnel.reachedFtd / funnel.leads : 0;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-h1 font-semibold tracking-tight text-ink">Your performance</h1>
        <p className="mt-0.5 text-body text-ink-muted">
          Counted from what was actually logged, so a correction removes itself.
        </p>
      </div>

      {/* Period selector */}
      <nav aria-label="Time period" className="mb-6 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/stats?period=${p}`}
            aria-current={p === period ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-small font-medium transition-colors duration-fast",
              p === period
                ? "border-accent bg-accent text-white"
                : "border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink"
            )}
          >
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </nav>

      {/* Headline numbers */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Leads added"
          value={funnel.leads.toLocaleString()}
          sub={PERIOD_LABEL[period]}
          icon={<UserCheck size={14} />}
        />
        <Metric
          label="Deposits"
          value={funnel.reachedFtd.toLocaleString()}
          sub={`${(conversion * 100).toFixed(1)}% of leads`}
          icon={<Wallet size={14} />}
        />
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
          label="Best month"
          value={records.bestMonth ? String(records.bestMonth.leads) : "—"}
          sub={records.bestMonth ? `leads in ${records.bestMonth.label}` : "Nothing logged yet"}
          icon={<Target size={14} />}
        />
      </div>

      {/* Funnel */}
      <section className="mb-8">
        <SectionHeader
          title="Conversion funnel"
          hint={`Of the leads you added in this period, how far they eventually got. Milestones are dated when they happened, so later status edits don't rewrite history.`}
        />
        {funnel.leads === 0 ? (
          <EmptyState
            icon={<BarChart size={18} />}
            title="No leads in this period"
            body="Pick a longer period, or add players and come back once there's something to measure."
          />
        ) : (
          <Card>
            <div className="space-y-4">
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
                  {funnel.reachedVip - funnel.reachedFtd} of your VIP transfers never
                  deposited — that gap is usually the biggest single win available.
                </>
              ) : funnel.reachedVip === 0 ? (
                <>Nobody reached VIP transfer in this period.</>
              ) : (
                <>Every VIP transfer in this period went on to deposit.</>
              )}
            </p>
          </Card>
        )}
      </section>

      {/* Trend */}
      <section className="mb-8">
        <SectionHeader title="Last 30 days" hint="Leads added each day." />
        <Card>
          <TrendChart days={trend} timezone={me.timezone} />
        </Card>
      </section>

      {/* Sources */}
      <section className="mb-8">
        <SectionHeader
          title="Where your deposits come from"
          hint="Ranked by conversion rate, not volume — the source that produces the most leads is rarely the one that produces the most deposits."
        />
        {sources.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={18} />}
            title="No sources recorded yet"
            body="Set a source when you add a player and this table will show which ones are actually worth your time."
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <th scope="col" className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-label font-medium uppercase tracking-wide text-ink-subtle">
                    Leads
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-label font-medium uppercase tracking-wide text-ink-subtle">
                    Deposits
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-label font-medium uppercase tracking-wide text-ink-subtle">
                    Rate
                  </th>
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
                          tooSmall ? "text-ink-subtle" : s.rate > 0 ? "text-success" : "text-ink-muted"
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
        <SectionHeader title="Records" hint="All time, whatever period is selected above." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Best day"
            value={records.bestDay ? String(records.bestDay.leads) : "—"}
            sub={records.bestDay ? `leads on ${records.bestDay.date}` : "Nothing logged yet"}
            icon={<Target size={14} />}
          />
          <Metric
            label="Best week"
            value={records.bestWeek ? String(records.bestWeek.leads) : "—"}
            sub={records.bestWeek?.label ?? "Nothing logged yet"}
            icon={<Target size={14} />}
          />
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
        </div>
      </section>
    </>
  );
}
