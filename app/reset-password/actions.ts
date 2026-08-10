"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error?: string } | null;

/**
 * SET A NEW PASSWORD.
 *
 * Only works while the one-time session created by the emailed link is active,
 * which is what stops this being a way to change somebody else's password.
 *
 * The rules are deliberately modest: length, and a check against a short list
 * of passwords that get guessed first. Forcing symbols and mixed case mostly
 * produces "Password1!" written on a sticky note.
 */
const OBVIOUS = [
  "password", "12345678", "123456789", "qwerty123", "password1",
  "letmein1", "welcome1", "iloveyou", "admin123", "dailygamba",
];

export async function setNewPassword(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Use at least 10 characters. Length matters more than symbols." };
  }
  if (password !== confirm) {
    return { error: "Those two don't match." };
  }
  if (OBVIOUS.includes(password.toLowerCase())) {
    return { error: "That one is guessed constantly. Pick something else." };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "That link has expired. Ask an admin to send a new one, or use Forgot your password.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/today?reset=1");
}
