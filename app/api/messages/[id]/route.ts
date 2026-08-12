import { NextResponse } from "next/server";
import { getPlayerMessages } from "@/lib/book";
import { getMe } from "@/lib/queries";

/**
 * One player's message log, fetched on demand.
 *
 * Same shape as the timeline route and for the same reason: a book of two
 * thousand players would mean loading conversations nobody opens. Row Level
 * Security applies to the query underneath, so asking for a player you cannot
 * see returns nothing rather than an error that confirms they exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const me = await getMe();
  if (!me) return NextResponse.json([], { status: 401 });

  try {
    return NextResponse.json(await getPlayerMessages(params.id));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
