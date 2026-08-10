import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser components.
 *
 * The publishable key is safe here by design - Row Level Security is what
 * protects the data. Someone reading this key out of the page source still
 * can't see another rep's players.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
