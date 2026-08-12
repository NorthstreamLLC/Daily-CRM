import { redirect } from "next/navigation";
import { getMe } from "@/lib/queries";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

/**
 * Admin area.
 *
 * The guard sits on the layout rather than on each page, so a new admin page
 * cannot be added without it. This is the interface being honest about who
 * should be here; the enforcement that matters is Row Level Security, which
 * stops a rep's session reading other people's rows even if they arrive at
 * this URL directly.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/today");

  return (
    <>
      <div className="mb-4">
        <h1 className="text-h1 font-semibold tracking-tight text-ink">Admin</h1>
        <p className="mt-0.5 text-body text-ink-muted">
          Team, targets, settings and company-wide views. Only admins see this.
        </p>
      </div>

      <AdminNav />
      {children}
    </>
  );
}
