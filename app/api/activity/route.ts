import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * The players behind one cell of the Activity page.
 *
 * Fetched on click rather than sent with the page. Thirteen reps times
 * fourteen days times four kinds is several hundred lists, nearly all of which
 * nobody opens - and the page already loads fast because it asks the database
 * for counts rather than rows.
 *
 * The signed-in user's client, NOT the service role: activity_players is
 * security invoker, so RLS decides whether this caller may see that rep's day.
 * An admin can open anyone's; a rep can open their own and gets nothing for
 * anybody else's. No role check is written here on purpose - a check in the
 * route is one more copy of a rule that already exists in the database, and
 * copies of rules are what drift.
 */
export async function GET(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const day = searchParams.get("day") ?? "";
  const user = searchParams.get("user") ?? "";
  const kind = searchParams.get("kind") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Bad date." }, { status: 400 });
  }
  if (!["leads", "contacts", "vip", "deposits"].includes(kind)) {
    return NextResponse.json({ error: "Bad kind." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("activity_players", {
    p_day: day,
    p_user: user,
    p_kind: kind,
  });

  if (error) {
    return NextResponse.json(
      {
        error: /does not exist|schema cache/i.test(error.message)
          ? "Run migration 20260812000054_activity_players.sql first."
          : error.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ players: data ?? [] });
}
