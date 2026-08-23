import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskRow } from "./TaskRow";
import { AddPlayer } from "./AddPlayer";
import { ViewAs } from "../ViewAs";
import { RenderStamp } from "../RenderStamp";
import { TodayTabs } from "./TodayTabs";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, cn } from "@/components/ui";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Clock,
  TrendingUp,
  UserCheck,
  Wallet,
} from "@/components/icons";
import {
  getMe,
  getDueNow,
  getComingUp,
  countComingUp,
  countDeadLeads,
  getTodayStats,
  getTargets,
  getStatuses,
  getSources,
  getSettings,
  canSeeWager,
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

/**
 * A heading that sits inside the list rather than above it.
 *
 * GroupHeader puts a title over a stack of cards. This is a rule across a
 * continuous sheet - the same job a frozen header row does in a spreadsheet,
 * which is what a rep working three hundred rows expects.
 */
function ListHeading({
  title,
  count,
  hint,
  tone = "neutral",
}: {
  title: string;
  count: number;
  hint?: string;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b-2 border-line-heavy px-3 py-1.5",
        tone === "danger" ? "bg-danger-soft" : "bg-sunken"
      )}
    >
      <span
        className={cn(
          "text-label font-semibold uppercase tracking-wide",
          tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-ink-muted"
        )}
      >
        {title}
      </span>
      <span
        className={cn(
          "tabular rounded px-1.5 text-caption font-semibold",
          tone === "danger" ? "bg-danger text-white" : "bg-line-strong/50 text-ink"
        )}
      >
        {count}
      </span>
      {hint && <span className="text-caption text-ink-subtle">{hint}</span>}
    </div>
  );
}

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

  /* Three settings, one query - and started here rather than awaited here.

     Only the two "coming up" queries actually need a value out of it. Awaiting
     the settings row on its own line made every other query on this page wait
     behind it for no reason: one more sequential round trip to the database,
     paid on every single navigation. Kicking it off now and awaiting it inside
     the batch below puts it alongside the work instead of in front of it. */
  const settingsPromise = getSettings([
    "coming_up_window_days",
    "followup_attempts_before_dead",
    "overdue_highlight_hours",
  ]);

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

  /* The only two queries that genuinely depend on a setting. They chain off
     the promise above, so they cost one round trip after it - while everything
     else in the batch has been running the whole time. */
  const comingUpPromise = settingsPromise.then((s) =>
    // Cap it: a rep with 200 follow-ups in the window should not get
    // 200 rows in one go. The tab badge shows the true total.
    getComingUp(me, Number(s.coming_up_window_days) || 7, ownerId, 60)
  );
  const comingTotalPromise = settingsPromise.then((s) =>
    countComingUp(me, Number(s.coming_up_window_days) || 7, ownerId)
  );

  const startedAt = Date.now();

  const [settings, dueNow, comingUp, comingTotal, deadTotal, stats, targets, statuses, sources, churn, showWager, teamRes, ownerRes] =
    await Promise.all([
      settingsPromise,
      getDueNow(me, ownerId),
      comingUpPromise,
      comingTotalPromise,
      /* Dead leads are not today's work - they are a standing list, and at
         300 players they buried the rows that actually need doing. They live
         in the Book now, one filter click away. Only the count is kept, for
         the link. */
      countDeadLeads(me, ownerId),
      getTodayStats(me, ownerId),
      getTargets(me, ownerId),
      getStatuses(),
      getSources(),
      getChurn(me.timezone, ownerId, 20),
      canSeeWager(me),
      isAdmin
        ? supabase.from("users").select("id, name").eq("active", true).order("name")
        : Promise.resolve({ data: null }),
      viewingSomeoneElse
        ? supabase.from("users").select("name").eq("id", ownerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const team = (teamRes.data ?? []) as { id: string; name: string }[];
  const ownerName = (ownerRes.data as { name: string } | null)?.name ?? null;

  const comingUpDays = Number(settings.coming_up_window_days) || 7;
  const attemptsThreshold = Number(settings.followup_attempts_before_dead) || 3;
  const overdueHours = Number(settings.overdue_highlight_hours) || 24;

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

  const tab = one2("tab") === "coming" ? ("coming" as const) : ("work" as const);

  const rowProps = {
    statuses,
    sources,
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

      <TodayTabs
        current={tab}
        workCount={dueNow.length}
        comingCount={comingTotal}
      />

      {tab === "work" ? (
        <>
          {/* Overdue and due today, in one continuous list.
              Two headings, one bordered container - so the eye reads it as a
              single sheet with a rule through it rather than two stacks. */}
          {clear ? (
            <EmptyState
              icon={<CalendarCheck size={18} />}
              title="Nothing due today"
              body="Everyone in your book has been contacted recently. Add a player, or work ahead from Coming up."
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
              {overdue.length > 0 && (
                <>
                  <ListHeading
                    title="Overdue"
                    count={overdue.length}
                    hint="due before today"
                    tone="danger"
                  />
                  {overdue.map((p, i) => (
                    <TaskRow key={p.id} player={p} {...rowProps} striped={i % 2 === 1} />
                  ))}
                </>
              )}

              {dueToday.length > 0 && (
                <>
                  <ListHeading title="Due today" count={dueToday.length} tone="accent" />
                  {dueToday.map((p, i) => (
                    <TaskRow key={p.id} player={p} {...rowProps} striped={i % 2 === 1} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Falling away - a whale who stopped wagering outranks a routine
              follow-up, so it stays on the working view. */}
          {(churn.quiet.length > 0 || churn.dropping.length > 0 || churn.watched.length > 0) && (
            <section className="mt-7">
              <GroupHeader
                title="Falling away"
                count={churn.quiet.length + churn.dropping.length + churn.watched.length}
                hint={churn.basisLabel}
                tone="danger"
              />
              <div className="space-y-1.5">
                {churn.watched.length > 0 && (
                  <ChurnList
                    showWager={showWager}
                    players={churn.watched}
                    kind="watched"
                    windowDays={churn.windowDays}
                    allowWatch
                    limit={10}
                  />
                )}
                {churn.quiet.length > 0 && (
                  <ChurnList
                    showWager={showWager}
                    players={churn.quiet}
                    kind="quiet"
                    windowDays={churn.windowDays}
                    allowWatch
                    limit={8}
                  />
                )}
                {churn.dropping.length > 0 && (
                  <ChurnList
                    showWager={showWager}
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
        </>
      ) : (
        /* Coming up: the schedule. Nothing here is actionable yet, so there is
           no tick box - the row is for reading, and for opening notes. */
        <>
          {comingUp.length === 0 ? (
            <EmptyState
              icon={<Clock size={18} />}
              title="Nothing scheduled in the next few days"
              body={`Follow-ups appear here once someone's next contact date falls inside the next ${comingUpDays} days.`}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
              <ListHeading
                title={`Next ${comingUpDays} days`}
                count={comingTotal}
                hint="nothing to do yet"
              />
              {comingUp.map((p, i) => (
                <TaskRow
                  key={p.id}
                  player={p}
                  {...rowProps}
                  showComplete={false}
                  striped={i % 2 === 1}
                />
              ))}
              {comingTotal > comingUp.length && (
                <p className="border-t border-line-strong px-3 py-2 text-small text-ink-muted">
                  Showing the next {comingUp.length} of {comingTotal}. The rest arrive on
                  their own days.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Dead leads live in the Book now. A line, not a list. */}
      {deadTotal > 0 && (
        <p className="mt-6 text-small text-ink-muted">
          <span className="tabular font-medium text-ink">{deadTotal}</span> dead{" "}
          {deadTotal === 1 ? "lead is" : "leads are"} ready to retarget today.{" "}
          <Link
            href="/book?flag=dead"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Work them in the Book
          </Link>
          .
        </p>
      )}


      <p className="mt-10 text-caption text-ink-subtle">
        Times shown in {me.timezone.replace("_", " ")} — your own time zone decides what
        &ldquo;today&rdquo; means.
      </p>

      {/* Admins only: instrumentation, not something a rep needs to see. */}
      {isAdmin && <RenderStamp ms={Date.now() - startedAt} label="Today" />}
    </>
  );
}
