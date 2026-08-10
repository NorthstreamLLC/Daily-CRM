"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/pipeline", label: "Company pipeline" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/import", label: "Import & export" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 overflow-x-auto border-b border-line no-scrollbar">
      <nav aria-label="Admin sections" className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          // Overview is an exact match; the rest match their sub-pages too.
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-body font-medium",
                "transition-colors duration-fast",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
