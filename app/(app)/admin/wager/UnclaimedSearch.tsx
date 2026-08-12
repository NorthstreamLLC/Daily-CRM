"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui";
import { Search, X } from "@/components/icons";

/**
 * Search the unclaimed wagerers.
 *
 * The term lives in the URL like every other filter in the app, so a search
 * survives a refresh and can be sent to someone. Debounced, because the list
 * is recomputed server-side on each change.
 */
export function UnclaimedSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const [value, setValue] = useState(params.get("wq") ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (value.trim()) sp.set("wq", value.trim());
      else sp.delete("wq");
      start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-[240px]">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
          <Search size={15} />
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Search unclaimed Roobet usernames"
          className="pl-8"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {pending && <span className="text-caption text-ink-subtle">Searching…</span>}
    </div>
  );
}
