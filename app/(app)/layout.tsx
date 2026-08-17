import { signOut } from "../login/actions";
import { getMe, getUnreadCount } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatToday } from "@/lib/time";
import { Sidebar, type NavItem } from "./Sidebar";

export const dynamic = "force-dynamic";

/**
 * Application shell.
 *
 * Every signed-in page renders inside this frame, so navigation, branding and
 * page width are defined in exactly one place. The Admin entry is added to the
 * nav rather than hidden with CSS - a rep's browser never receives it. The real
 * protection is Row Level Security in the database; this keeps the interface
 * honest.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();

  if (!me) {
    /* A valid session with no profile row.
    
       This happens when someone is created in Supabase > Authentication >
       Users, which makes a LOGIN but not a person: no name, no code, no
       timezone, no role. The app reads public.users for all of that.
    
       Redirecting to /login here caused an infinite loop - the middleware sees
       a valid session and sends them straight back. So say what is wrong
       instead, and give the one way out that always works. */
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-card border border-line-strong bg-surface p-6 shadow-card">
          <h1 className="text-h2 font-semibold text-ink">Account not set up yet</h1>
          <p className="mt-2 text-body text-ink-muted">
            {user?.email ? (
              <>
                <span className="font-medium text-ink">{user.email}</span> can sign
                in, but has no profile in the CRM yet - no name, code or book.
              </>
            ) : (
              "This login has no profile in the CRM yet."
            )}
          </p>
          <p className="mt-3 text-small text-ink-muted">
            An admin needs to add them under{" "}
            <span className="font-medium text-ink">Admin &rarr; People</span>, which
            creates the login and the profile together. Creating a user in the
            Supabase dashboard only makes half of it.
          </p>
          <form action={signOut} className="mt-5">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-control bg-accent px-3.5
                         text-body font-medium text-white btn-on-accent hover:bg-accent-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const unreadCount = await getUnreadCount();

  const items: NavItem[] = [
    { href: "/today", label: "Today", icon: "today" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/book", label: "Book", icon: "book" },
    { href: "/stats", label: "Stats", icon: "stats" },
    ...(me.role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: "admin" as const }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        items={items}
        user={{
          name: me.name,
          code: me.code,
          role: me.role,
          today: formatToday(me.timezone),
        }}
        signOut={signOut}
        unreadCount={unreadCount}
      />

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
