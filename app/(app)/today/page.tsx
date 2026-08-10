import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskRow } from "./TaskRow";
import { AddPlayer } from "./AddPlayer";
import { EmptyState, SectionHeader, cn } from "@/components/ui";
import { CalendarCheck, Clock, Inbox, Target, TrendingUp, UserCheck, Wallet } from "@/components/icons";
import {
  getMe,
  getDueNow,
  getComingUp,
  getDeadLeads,
  getTodayStats,
  getTargets,
  getStatuses,
  getSources,
  getSetting,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/* --------------------------------------------------------------- Stat card */

function StatCard({
  label,
  value,
  target,
  icon,
}: {
  label: string;
  value: number;
  target: number;
  icon: React.ReactNode;
}) {
  const hit = target > 0 && value >= target;
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <p className="text-label font-medium uppercase tracking-wide">{label}</p>
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tabular text-metric font-semibold",
            hit ? "text-success" : "text-ink"
          )}
        >
          {value}
        </span>
        <span className="tabular text-small text-ink-subtle">of {target}</span>
      </p>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label}: ${value} of ${target}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-base",
            hit ? "bg-success" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={cn("mt-1.5 text-caption", hit ? "text-success" : "text-ink-subtle")}>
        {target === 0
          ? "No target set"
          : hit
          ? "Target met"
          : `${target - value} to go`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- Page */

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const justReset = searchParams.reset === "1";

  const [comingUpDaysRaw, attemptsRaw, overdueRaw] = await Promise.all([
    getSetting("coming_up_window_days", "7"),
    getSetting("followup_attempts_before_dead", "3"),
    getSetting("overdue_highlight_hours", "24"),
  ]);

  const comingUpDays = Number(comingUpDaysRaw) || 7;
  const attemptsThreshold = Number(attemptsRaw) || 3;
  const overdueHours = Number(overdueRaw) || 24;

  const [dueNow, comingUp, deadLeads, stats, targets, statuses, sources] =
    await Promise.all([
      getDueNow(me),
      getComingUp(me, comingUpDays),
      getDeadLeads(me),
      getTodayStats(me),
      getTargets(me),
      getStatuses(),
      getSources(),
    ]);

  const rowProps = { statuses, timezone: me.timezone, attemptsThreshold, overdueHours };

  return (
    <>
      {justReset && (
        <div className="mb-5 flex items-center gap-2 rounded-card border border-success/25
                        bg-success-soft px-4 py-2.5 text-small text-success" role="status">
          <UserCheck size={15} />
          Password changed and you&rsquo;re signed in.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">
            Today&rsquo;s work
          </h1>
          <p className="mt-0.5 text-body text-ink-muted">
            {dueNow.length === 0
              ? "Nothing due right now."
              : `${dueNow.length} ${dueNow.length === 1 ? "person" : "people"} to reach out to.`}
          </p>
        </div>
        <AddPlayer sources={sources} defaultSource={me.default_source} />
      </div>

      {/* Targets */}
      <section aria-labelledby="targets-heading" className="mb-8">
        <h2 id="targets-heading" className="sr-only">
          Today against target
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Active leads"
            value={stats.activeLeads}
            target={targets.activeLeads}
            icon={<UserCheck size={14} />}
          />
          <StatCard
            label="VIP transfers"
            value={stats.vipTransfers}
            target={targets.vipTransfers}
            icon={<TrendingUp size={14} />}
          />
          <StatCard
            label="First deposits"
            value={stats.ftds}
            target={targets.ftds}
            icon={<Wallet size={14} />}
          />
        </div>
      </section>

      {/* Queue */}
      <section aria-labelledby="queue-heading" className="mb-8">
        <SectionHeader
          title="Today's queue"
          count={dueNow.length}
          hint="Longest neglected first. Tick one off and it leaves until it's due again."
        />
        {dueNow.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck size={18} />}
            title="Nothing due today"
            body="Everyone in your book has been contacted recently. Add a player, or work ahead from Coming up."
          />
        ) : (
          <div className="space-y-2">
            {dueNow.map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} />
            ))}
          </div>
        )}
      </section>

      {/* Coming up - always present, so its absence is never mistaken for a bug */}
      <section aria-labelledby="coming-heading" className="mb-8">
        <SectionHeader
          title="Coming up"
          count={comingUp.length}
          hint={`Due within the next ${comingUpDays} days. Nothing to do yet.`}
        />
        {comingUp.length === 0 ? (
          <EmptyState
            icon={<Clock size={18} />}
            title="Nothing scheduled in the next few days"
            body="Follow-ups appear here once someone's next contact date is within the window."
          />
        ) : (
          <div className="space-y-2 opacity-90">
            {comingUp.map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} showComplete={false} />
            ))}
          </div>
        )}
      </section>

      {/* Dead leads */}
      <section aria-labelledby="dead-heading">
        <SectionHeader
          title="Dead leads"
          count={deadLeads.length}
          hint="Soonest retarget first. Work these whenever you like — they also rejoin the queue when their 30 days is up."
          action={
            <Link
              href="/book?flag=dead"
              className="text-small font-medium text-accent underline-offset-2 hover:underline"
            >
              See all in Book
            </Link>
          }
        />
        {deadLeads.length === 0 ? (
          <EmptyState
            icon={<Inbox size={18} />}
            title="No dead leads"
            body="Nobody has been marked Dead Lead yet. When someone stops responding, set their status and they'll wait here for a retarget."
          />
        ) : (
          <div className="space-y-2">
            {deadLeads.slice(0, 25).map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} />
            ))}
            {deadLeads.length > 25 && (
              <p className="pt-1 text-small text-ink-muted">
                Showing 25 of {deadLeads.length}.{" "}
                <Link href="/book?flag=dead" className="font-medium text-accent hover:underline">
                  See the rest in Book
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-10 flex items-center gap-1.5 text-caption text-ink-subtle">
        <Target size={12} />
        Times shown in {me.timezone.replace("_", " ")} — your own time zone decides what
        &ldquo;today&rdquo; means.
      </p>
    </>
  );
}
