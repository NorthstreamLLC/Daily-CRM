"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";

export type MeetingState = { error?: string; message?: string } | null;

/**
 * Create a meeting.
 *
 * The date and time arrive as the rep's wall-clock values; combining them with
 * the timezone offset happens in the browser (which knows the offset), so what
 * is stored is a true instant and the calendar shows it on the right day for
 * whoever looks at it.
 */
export async function addMeeting(
  _prev: MeetingState,
  formData: FormData
): Promise<MeetingState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startsAtIso = String(formData.get("starts_at_iso") ?? "");

  if (!title) return { error: "Give the meeting a name." };

  const starts = new Date(startsAtIso);
  if (isNaN(starts.getTime())) return { error: "Pick a date and time." };

  const supabase = createClient();
  const { error } = await supabase.from("meetings").insert({
    user_id: me.id,
    title,
    notes: notes || null,
    starts_at: starts.toISOString(),
  });

  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return { message: `"${title}" added.` };
}

export async function deleteMeeting(meetingId: string): Promise<MeetingState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return { message: "Meeting removed." };
}
