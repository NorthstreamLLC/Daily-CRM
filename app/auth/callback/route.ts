import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where email links land - password resets and invites.
 * Exchanges the code for a session, then sends the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/today";

  // Only ever redirect within this site. An open redirect here would let a
  // crafted email bounce someone straight off to another domain.
  const next = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/today";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
