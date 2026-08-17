import { NextResponse } from "next/server";
import { getMe, getUnreadCount } from "@/lib/queries";

/**
 * Just the number, for the badge to poll.
 *
 * Deliberately its own route rather than reusing the list endpoint: this is
 * called every couple of minutes by every open tab, and it must stay a single
 * counting query that returns no rows.
 */
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ unread: 0 }, { status: 401 });

  try {
    return NextResponse.json({ unread: await getUnreadCount() });
  } catch {
    return NextResponse.json({ unread: 0 }, { status: 200 });
  }
}
