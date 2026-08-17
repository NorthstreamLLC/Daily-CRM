import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWagerSync } from "@/lib/wager-sync";

/** Syncing five leaderboards takes longer than the default serverless limit. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * SCHEDULED WAGER SYNC.
 *
 * Hourly, unattended. There is no signed-in user, so two things differ from
 * the manual route and only these two:
 *
 *   Authentication is a shared secret in the Authorization header rather than
 *   a session. Without CRON_SECRET set, this endpoint refuses to run at all -
 *   an open sync URL would let anyone on the internet hammer the Roobet API
 *   using your keys.
 *
 *   The Supabase client is the service role, because Row Level Security has no
 *   session to check. That is why the secret check above it is not optional.
 *
 * Everything else is the same code the button runs.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so scheduled syncing is disabled." },
      { status: 503 }
    );
  }

  // Vercel Cron sends "Bearer <CRON_SECRET>"; a plain token is accepted too so
  // any external scheduler can call this.
  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "").trim();

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 }
    );
  }

  // The audit trail needs a real person against it. Use the longest-standing
  // active admin, and the action name marks it as automatic either way.
  const { data: actor } = await admin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!actor) {
    return NextResponse.json({ error: "No active admin to attribute this to." }, { status: 500 });
  }

  const startedAt = Date.now();
  const outcome = await runWagerSync(admin, actor.id, "scheduled");
  const seconds = Math.round((Date.now() - startedAt) / 1000);

  /* Housekeeping, once a day, on the run just after midnight UTC.
  
     Daily wager rows grow by (wagerers x codes) every single day and nothing
     ever reads one older than two months. Left alone it is the one table that
     grows without limit. Doing it here rather than as a separate schedule
     means there is one moving part, not two. */
  let pruned: number | null = null;
  if (new Date().getUTCHours() === 0) {
    // Housekeeping must never take the sync down with it.
    const { data, error } = await admin.rpc("prune_wager_days", { p_keep_days: 75 });
    pruned = error ? null : typeof data === "number" ? data : null;

    // Same reasoning: an inbox nobody prunes becomes a table nobody queries fast.
    await admin.rpc("prune_notifications");
  }

  if ("error" in outcome) {
    return NextResponse.json({ ok: false, ...outcome, seconds }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    seconds,
    pruned,
    advanced: outcome.advanced,
    sources: outcome.results.map((r) => ({
      name: r.name,
      entries: r.entries,
      matched: r.matched,
      error: r.error ?? null,
    })),
  });
}

// Vercel Cron issues GET; POST is accepted so any scheduler works.
export const GET = handle;
export const POST = handle;
