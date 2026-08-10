import { NextResponse } from "next/server";
import { getPlayerTimeline } from "@/lib/book";
import { getMe } from "@/lib/queries";

/**
 * One player's history, fetched on demand.
 *
 * History is only ever opened for one player at a time, so loading it with the
 * page would mean fetching thousands of rows nobody looks at. Row Level
 * Security still applies to the query underneath - asking for a player you
 * cannot see returns nothing rather than an error that confirms they exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const me = await getMe();
  if (!me) return NextResponse.json([], { status: 401 });

  try {
    const events = await getPlayerTimeline(params.id);
    return NextResponse.json(events);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
