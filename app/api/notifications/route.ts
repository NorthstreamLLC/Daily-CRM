import { NextResponse } from "next/server";
import { getMe, getNotifications } from "@/lib/queries";

/**
 * The inbox, fetched when the panel opens.
 *
 * Kept out of the layout deliberately. The layout renders on every
 * navigation, and loading twenty rows each time to fill a panel most reps
 * never open is exactly the sort of cost that is invisible at ten players and
 * expensive across thirteen people working all day. The layout asks for the
 * count alone; this returns the list, once, on demand.
 */
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json([], { status: 401 });

  try {
    return NextResponse.json(await getNotifications());
  } catch {
    // Migration not run yet - an empty panel beats a broken sidebar.
    return NextResponse.json([], { status: 200 });
  }
}
