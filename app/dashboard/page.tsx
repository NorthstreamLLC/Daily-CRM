import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { PlayerRow } from "./PlayerRow";
import { AddPlayer } from "./AddPlayer";
import { formatToday } from "@/lib/time";
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

function StatCard({ label, value, target }: { label: string; value: number; target: number }) {
  const hit = target > 0 && value >= target;
  return (
    <div
      className={`rounded-lg border p-5 shadow-sm ${
        hit ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${hit ? "text-green-700" : "text-navy"}`}>
        {value}
        <span className="ml-1 text-base font-normal text-slate-400">/ {target}</span>
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <span className="text-sm text-slate-400">{count}</span>
      </div>
      {hint && <p className="mb-3 text-xs text-slate-400">{hint}</p>}
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const comingUpDays = Number(await getSetting("coming_up_window_days", "7"));
  const attemptsThreshold = Number(
    await getSetting("followup_attempts_before_dead", "3")
  );

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

  const rowProps = {
    statuses,
    timezone: me.timezone,
    attemptsThreshold,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-navy">Daily Gamba</h1>
            <p className="text-xs text-slate-500">{formatToday(me.timezone)}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{me.name}</p>
              <p className="text-xs text-slate-500">
                {me.code} · {me.role === "admin" ? "Admin" : "Rep"}
              </p>
            </div>
            <form action={signOut}>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm
                                 text-slate-600 transition hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today vs target
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Active Leads" value={stats.activeLeads} target={targets.activeLeads} />
            <StatCard label="VIP Transfers" value={stats.vipTransfers} target={targets.vipTransfers} />
            <StatCard label="FTDs" value={stats.ftds} target={targets.ftds} />
          </div>
        </section>

        <Section
          title="Today's queue"
          count={dueNow.length}
          hint="Longest neglected first. Tick one off and it leaves the list until it's due again."
        >
          <div className="mb-3">
            <AddPlayer sources={sources} defaultSource={me.default_source} />
          </div>

          {dueNow.length === 0 ? (
            <Empty text="Nothing due. Either you're on top of it, or there's nobody in your book yet." />
          ) : (
            <div className="space-y-2">
              {dueNow.map((p) => (
                <PlayerRow key={p.id} player={p} {...rowProps} />
              ))}
            </div>
          )}
        </Section>

        {comingUp.length > 0 && (
          <Section
            title="Coming up"
            count={comingUp.length}
            hint={`Due within ${comingUpDays} days. Nothing to do yet.`}
          >
            <div className="space-y-2 opacity-75">
              {comingUp.map((p) => (
                <PlayerRow key={p.id} player={p} {...rowProps} showComplete={false} />
              ))}
            </div>
          </Section>
        )}

        {deadLeads.length > 0 && (
          <Section
            title="Dead leads"
            count={deadLeads.length}
            hint="Soonest retarget first. Work these whenever you like — they also come back into today's queue when their 30 days is up."
          >
            <div className="space-y-2">
              {deadLeads.map((p) => (
                <PlayerRow key={p.id} player={p} {...rowProps} />
              ))}
            </div>
          </Section>
        )}

        <p className="mt-10 text-xs text-slate-400">
          Times in {me.timezone.replace("_", " ")} — your own time zone decides what
          &ldquo;today&rdquo; means.
        </p>
      </main>
    </div>
  );
}
