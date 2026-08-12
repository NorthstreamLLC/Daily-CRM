import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskRow } from "./TaskRow";
import { AddPlayer } from "./AddPlayer";
import { ViewAs } from "../ViewAs";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, cn } from "@/components/ui";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Clock,
  Inbox,
  TrendingUp,
  UserCheck,
  Wallet,
} from "@/components/icons";
import {
  getMe,
  getDueNow,
  getComingUp,
  countDeadLeads,
  getDeadLeads,
  getTodayStats,
  getTargets,
  getStatuses,
  getSources,
  getSetting,
} from "@/lib/queries";
import { startOfDayUtc } from "@/lib/time";
import { getChurn } from "@/lib/churn";
import { ChurnList } from "../ChurnList";
import type { Player } from "@/lib/queries";

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
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-ink-subtle">
          {icon}
          {label}
        </p>
        {hit && (
          <span className="inline-flex items-center gap-1 text-caption font-medium text-success">
            <Check size={11} /> Met
          </span>
        )}
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("tabular text-metric font-semibold", hit ? "text-success" : "text-ink")}>
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
    </div>
  );
}

/* ------------------------------------------------------------ Group header */

function GroupHeader({
  title,
  count,
  hint,
  tone = "neutral",
  action,
}: {
  title: string;
  count: number;
  hint?: string;
  tone?: "neutral" | "danger" | "accent";
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-4 w-1 rounded-full",
            tone === "danger" ? "bg-danger" : tone === "accent" ? "bg-accent" : "bg-line-strong"
          )}
          aria-hidden="true"
        />
        <h2
          className={cn(
            "text-h3 font-semibold",
            tone === "danger" ? "text-danger" : "text-ink"
          )}
        >
          {title}
        </h2>
        <span className="tabular text-small text-ink-subtle">{count}</span>
        {hint && (
          <span className="hidden text-small text-ink-subtle sm:inline">· {hint}</span>
        )}
      </div>
      {action}
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

  /* An admin may look at any rep's day; a rep is pinned to their own,
     whatever the URL says. Everything below is scoped to this id explicitly -
     see the note in getDueNow for why RLS alone was not enough. */
  const isAdmin = me.role === "admin";
  const one2 = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const ownerId = (isAdmin ? one2("owner") : "") || me.id;
  const viewingSomeoneElse = ownerId !== me.id;

  const supabase = createClient();

  const [dueNow, comingUp, deadLeads, deadTotal, stats, targets, statuses, sources, churn, teamRes, ownerRes] =
    await Promise.all([
      getDueNow(me, ownerId),
      getComingUp(me, comingUpDays, ownerId),
      // Today shows a few and links to the Book for the rest.
      getDeadLeads(me, ownerId, 12),
      countDeadLeads(me, ownerId),
      getTodayStats(me, ownerId),
      getTargets(me, ownerId),
      getStatuses(),
      getSources(),
      getChurn(me.timezone, ownerId, 20),
      isAdmin
        ? supabase.from("users").select("id, name").eq("active", true).order("name")
        : Promise.resolve({ data: null }),
      viewingSomeoneElse
        ? supabase.from("users").select("name").eq("id", ownerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const team = (teamRes.data ?? []) as { id: string; name: string }[];
  const ownerName = (ownerRes.data as { name: string } | null)?.name ?? null;

  /**
   * Split the queue into overdue and due-today.
   *
   * One flat list of forty people gives no sense of what matters. Two short
   * lists do, and the grouping is what carries the red rather than every row
   * shouting individually.
   *
   * Someone never contacted counts as due today - they are waiting on a first
   * conversation, which is exactly as urgent as a follow-up landing today.
   */
  const dayStart = startOfDayUtc(me.timezone).getTime();
  const overdue: Player[] = [];
  const dueToday: Player[] = [];

  for (const p of dueNow) {
    const late =
      p.last_contact_at !== null &&
      p.next_followup_at !== null &&
      new Date(p.next_followup_at).getTime() < dayStart;
    if (late) overdue.push(p);
    else dueToday.push(p);
  }

  const rowProps = {
    statuses,
    timezone: me.timezone,
    attemptsThreshold,
    overdueHours,
    dayStartMs: dayStart,
  };
  const clear = dueNow.length === 0;

  return (
    <>
      {justReset && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-card border border-success/25
                     bg-success-soft px-4 py-2.5 text-small text-success"
        >
          <UserCheck size={15} />
          Password changed and you&rsquo;re signed in.
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">
            {viewingSomeoneElse && ownerName ? `${ownerName}'s day` : "Today"}
          </h1>
          <p className="mt-0.5 text-body text-ink-muted">
            {clear
              ? viewingSomeoneElse
                ? "Their queue is clear."
                : "Your queue is clear."
              : `${dueNow.length} ${dueNow.length === 1 ? "person" : "people"} to reach out to.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <ViewAs team={team} current={ownerId} meId={me.id} basePath="/today" />
          )}
          {/* Adding a player puts them in YOUR book, so it is hidden while
              looking at someone else's day - it would silently create the
              player under the wrong rep. */}
          {!viewingSomeoneElse && (
            <AddPlayer
              sources={sources}
              defaultSource={me.default_source}
              statuses={statuses as { name: string }[]}
            />
          )}
        </div>
      </div>

      {/* Whether today's work is done, said once and plainly. */}
      <div
        role="status"
        className={cn(
          "mb-6 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3",
          overdue.length > 0
            ? "border-danger/30 bg-danger-soft"
            : clear
            ? "border-success/25 bg-success-soft"
            : "border-line bg-surface"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            overdue.length > 0
              ? "bg-danger/10 text-danger"
              : clear
              ? "bg-success/10 text-success"
              : "bg-sunken text-ink-muted"
          )}
        >
          {overdue.length > 0 ? (
            <AlertTriangle size={16} />
          ) : clear ? (
            <Check size={16} />
          ) : (
            <CalendarCheck size={16} />
          )}
        </span>

        <div className="min-w-0">
          <p
            className={cn(
              "text-body font-semibold",
              overdue.length > 0 ? "text-danger" : clear ? "text-success" : "text-ink"
            )}
          >
            {overdue.length > 0
              ? `${overdue.length} overdue`
              : clear
              ? "Nothing due"
              : `${dueNow.length} to do today`}
          </p>
          <p className="mt-0.5 text-small text-ink-muted">
            {overdue.length > 0
              ? "These were due before today. Work them first — they've waited longest."
              : clear
              ? "Everyone has been contacted recently. Add a player, or work ahead from Coming up."
              : "Nothing is overdue. Clear these and you're done for the day."}
          </p>
        </div>
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
            icon={<UserCheck size={13} />}
          />
          <StatCard
            label="VIP transfers"
            value={stats.vipTransfers}
            target={targets.vipTransfers}
            icon={<TrendingUp size={13} />}
          />
          <StatCard
            label="First deposits"
            value={stats.ftds}
            target={targets.ftds}
            icon={<Wallet size={13} />}
          />
        </div>
      </section>

      {/* Overdue */}
      {overdue.length > 0 && (
        <section className="mb-7">
          <GroupHeader
            title="Overdue"
            count={overdue.length}
            hint="due before today"
            tone="danger"
          />
          <div className="space-y-1.5">
            {overdue.map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} />
            ))}
          </div>
        </section>
      )}

      {/* Due today */}
      {dueToday.length > 0 && (
        <section className="mb-7">
          <GroupHeader title="Due today" count={dueToday.length} tone="accent" />
          <div className="space-y-1.5">
            {dueToday.map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} />
            ))}
          </div>
        </section>
      )}

      {clear && (
        <section className="mb-8">
          <EmptyState
            icon={<CalendarCheck size={18} />}
            title="Nothing due today"
            body="Everyone in your book has been contacted recently. Add a player, or work ahead from Coming up."
          />
        </section>
      )}

      {/* Falling away. Above Coming up on purpose - a whale who stopped
          wagering outranks a routine follow-up scheduled for Thursday. */}
      {(churn.quiet.length > 0 || churn.dropping.length > 0 || churn.watched.length > 0) && (
        <section className="mb-7">
          <GroupHeader
            title="Falling away"
            count={churn.quiet.length + churn.dropping.length + churn.watched.length}
            hint={churn.basisLabel}
            tone="danger"
          />
          <div className="space-y-1.5">
            {churn.watched.length > 0 && (
              <ChurnList
                players={churn.watched}
                kind="watched"
                windowDays={churn.windowDays}
                allowWatch
                limit={10}
              />
            )}
            {churn.quiet.length > 0 && (
              <ChurnList
                players={churn.quiet}
                kind="quiet"
                windowDays={churn.windowDays}
                allowWatch
                limit={8}
              />
            )}
            {churn.dropping.length > 0 && (
              <ChurnList
                players={churn.dropping}
                kind="dropping"
                windowDays={churn.windowDays}
                allowWatch
                limit={5}
              />
            )}
          </div>
        </section>
      )}

      {/* Coming up - always present, so its absence is never taken for a bug */}
      <section className="mb-7">
        <GroupHeader
          title="Coming up"
          count={comingUp.length}
          hint={`next ${comingUpDays} days — nothing to do yet`}
        />
        {comingUp.length === 0 ? (
          <EmptyState
            icon={<Clock size={18} />}
            title="Nothing scheduled in the next few days"
            body="Follow-ups appear here once someone's next contact date falls inside the window."
          />
        ) : (
          <div className="space-y-1.5 opacity-90">
            {comingUp.slice(0, 20).map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} showComplete={false} />
            ))}
            {comingUp.length > 20 && (
              <p className="pt-1 text-small text-ink-muted">
                Showing 20 of {comingUp.length}.{" "}
                <Link href="/book" className="font-medium text-accent hover:underline">
                  See the rest in Book
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </section>

      {/* Dead leads */}
      <section>
        <GroupHeader
          title="Dead leads"
          count={deadTotal}
          hint="soonest retarget first — they rejoin the queue when their 30 days is up"
          action={
            deadLeads.length > 0 ? (
              <Link
                href="/book?flag=dead"
                className="text-small font-medium text-accent underline-offset-2 hover:underline"
              >
                See all in Book
              </Link>
            ) : undefined
          }
        />
        {deadLeads.length === 0 ? (
          <EmptyState
            icon={<Inbox size={18} />}
            title="No dead leads"
            body="Nobody has been marked Dead Lead yet. When someone stops responding, set their status and they'll wait here for a retarget."
          />
        ) : (
          <div className="space-y-1.5">
            {deadLeads.map((p) => (
              <TaskRow key={p.id} player={p} {...rowProps} showComplete={false} />
            ))}
            {deadTotal > deadLeads.length && (
              <p className="pt-1 text-small text-ink-muted">
                Showing {deadLeads.length} of {deadTotal}.{" "}
                <Link href="/book?flag=dead" className="font-medium text-accent hover:underline">
                  See the rest in Book
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-10 text-caption text-ink-subtle">
        Times shown in {me.timezone.replace("_", " ")} — your own time zone decides what
        &ldquo;today&rdquo; means.
      </p>
    </>
  );
}
