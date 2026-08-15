import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE CLIENT.
 *
 * This key bypasses Row Level Security completely. It exists for exactly one
 * job: creating and disabling logins, which the Supabase Auth admin API will
 * not do with a normal key.
 *
 * Rules for using it:
 *   - server only, never imported into a client component
 *   - never used to read or write application data; use the normal client for
 *     that so RLS still applies
 *   - every caller must confirm the signed-in person is an admin first, since
 *     this client will not do it for them
 *
 * The key is optional. Without it the app runs normally and only the two
 * login-management actions are unavailable, which is a far better outcome than
 * refusing to start.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function serviceRoleAvailable() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Where to put the key.
 *
 * This runs on Vercel, so the instruction is the Vercel one. The trap worth
 * naming is not where the setting lives - it is that environment variables
 * are read at build time, so adding one to a deployment that already exists
 * changes nothing until it rebuilds. That is the step people skip, and the
 * symptom is this message stubbornly not going away.
 */
export function serviceRoleHelp() {
  return (
    "Add SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment " +
    "Variables, ticked for Production. Then redeploy with the build cache " +
    "OFF — environment variables are read at build time, so an existing " +
    "deployment will not pick it up. The value is in Supabase → Project " +
    "Settings → API → service_role. Never commit it: it bypasses every " +
    "security rule."
  );
}
