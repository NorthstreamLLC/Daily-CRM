import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { getMe } from "@/lib/queries";
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
  if (!me) redirect("/login");

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
      />

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
