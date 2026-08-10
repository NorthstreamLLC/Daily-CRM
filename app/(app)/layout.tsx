import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "../login/actions";
import { getMe } from "@/lib/queries";
import { formatToday } from "@/lib/time";
import { Nav, type NavItem } from "./Nav";
import { LogOut } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Application shell.
 *
 * Every signed-in page renders inside this, so the header, navigation and page
 * width are defined in exactly one place. The Admin link is added to the nav
 * rather than hidden with CSS - a rep's browser never receives it. The real
 * protection is Row Level Security in the database; this just keeps the
 * interface honest.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");

  const items: NavItem[] = [
    { href: "/today", label: "Today", icon: "today" },
    { href: "/book", label: "Book", icon: "book" },
    { href: "/stats", label: "Stats", icon: "stats" },
    ...(me.role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: "admin" as const }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="relative border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link
            href="/today"
            className="flex shrink-0 items-baseline gap-2 rounded-control"
            aria-label="Daily Gamba, go to today's queue"
          >
            <span className="text-h3 font-semibold tracking-tight text-ink">
              Daily Gamba
            </span>
          </Link>

          <div className="ml-2 hidden md:block">
            <Nav items={items} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight lg:block">
              <p className="text-small font-medium text-ink">{me.name}</p>
              <p className="text-caption text-ink-subtle">
                {me.code} · {me.role === "admin" ? "Admin" : "Rep"} ·{" "}
                {formatToday(me.timezone)}
              </p>
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-control border
                           border-line-strong bg-surface px-3 text-small font-medium
                           text-ink-muted transition-colors duration-fast
                           hover:bg-sunken hover:text-ink"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>

            <div className="md:hidden">
              <Nav items={items} />
            </div>
          </div>
        </div>

        {/* Tablet: nav sits on its own row so the header never crowds. */}
        <div className="hidden border-t border-line px-4 py-1.5 sm:block sm:px-6 md:hidden">
          <div className="mx-auto max-w-[1200px]">
            <Nav items={items} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
