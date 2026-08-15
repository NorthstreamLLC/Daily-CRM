import { SectionHeader, Notice } from "@/components/ui";
import { getMe, getSources } from "@/lib/queries";
import { getTeam } from "@/lib/admin";
import { serviceRoleAvailable, serviceRoleHelp } from "@/lib/supabase/admin";
import { getTimezones } from "../actions";
import { AddUser } from "./AddUser";
import { UserRow } from "./UserRow";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const me = await getMe();
  if (!me) return null;

  const [team, sources, timezones] = await Promise.all([
    getTeam(),
    getSources(),
    getTimezones(),
  ]);

  const active = team.filter((u) => u.active);
  const inactive = team.filter((u) => !u.active);
  const admins = active.filter((u) => u.role === "admin").length;
  const serviceReady = serviceRoleAvailable();
  const help = serviceRoleHelp();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold tracking-tight text-ink">People</h2>
          <p className="mt-0.5 text-body text-ink-muted">
            {active.length} active · {admins} {admins === 1 ? "admin" : "admins"}
            {inactive.length > 0 && ` · ${inactive.length} deactivated`}
          </p>
        </div>
        <AddUser
          sources={sources}
          timezones={timezones}
          serviceRoleReady={serviceReady}
          serviceRoleHelp={help}
        />
      </div>

      {!serviceReady && (
        <div className="mb-4">
          <Notice tone="warning">
            Creating and blocking logins is unavailable until the service role key is
            set. Everything else on this page — roles, targets, time zones, password
            resets — works now. {help}
          </Notice>
        </div>
      )}

      <div className="space-y-2">
        {active.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            everyone={team}
            sources={sources}
            timezones={timezones}
            isMe={u.id === me.id}
          />
        ))}
      </div>

      {inactive.length > 0 && (
        <section className="mt-8">
          <SectionHeader
            title="Deactivated"
            count={inactive.length}
            hint="They cannot sign in. Their players, history and past numbers are untouched."
          />
          <div className="space-y-2">
            {inactive.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                everyone={team}
                sources={sources}
                timezones={timezones}
                isMe={u.id === me.id}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
