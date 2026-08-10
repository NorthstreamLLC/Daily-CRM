import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security means this returns your own row and nobody else's,
  // even though the query doesn't say so.
  const { data: me } = await supabase
    .from("users")
    .select("name, code, role, timezone")
    .eq("id", user.id)
    .single();

  const { data: targets } = await supabase
    .from("kpi_targets")
    .select("active_leads_per_day, vip_transfers_per_day, ftd_per_day")
    .eq("user_id", user.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  // "Today" resolves in this person's own time zone, not the server's.
  // This is what was giving the South Africa reps yesterday's date.
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: me?.timezone ?? "UTC",
  }).format(new Date());

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm">
          <h1 className="mb-2 font-semibold text-amber-900">Account not set up</h1>
          <p className="text-amber-800">
            You&apos;re signed in as <strong>{user.email}</strong>, but there&apos;s no
            matching person record. An admin needs to add you before you can use the CRM.
          </p>
          <form action={signOut} className="mt-4">
            <button className="text-amber-900 underline underline-offset-2">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const stats = [
    { label: "Active Leads", target: targets?.active_leads_per_day ?? 0 },
    { label: "VIP Transfers", target: targets?.vip_transfers_per_day ?? 0 },
    { label: "FTDs", target: targets?.ftd_per_day ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-navy">Daily Gamba</h1>
            <p className="text-xs text-slate-500">{today}</p>
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

      <main className="mx-auto max-w-5xl px-6 py-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today vs target
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="mt-1 text-3xl font-bold text-navy">
                  0
                  <span className="ml-1 text-base font-normal text-slate-400">
                    / {s.target}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today&apos;s queue
          </h2>
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">
              Nothing here yet — no players have been imported.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              The queue is the next thing being built.
            </p>
          </div>
        </section>

        {me.role === "admin" && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Admin
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Company view, VIP transfers, FTDs, users and settings — coming next.
            </div>
          </section>
        )}

        <p className="mt-10 text-xs text-slate-400">
          Times shown in {me.timezone.replace("_", " ")} — your own time zone decides what
          &ldquo;today&rdquo; means.
        </p>
      </main>
    </div>
  );
}
