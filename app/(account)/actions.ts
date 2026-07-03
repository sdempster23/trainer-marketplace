"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { displayNameSchema } from "@/lib/validators/profile";

/**
 * Account Server Actions — role-UNIVERSAL profile self-management. Neither
 * (owner) nor (trainer) is the right home (both roles have a name), and
 * (auth) is credential/session lifecycle, not profile data — so account gets
 * its own group. First resident: the /account "Your name" section
 * (incidentally a trainer's first post-onboarding way to edit their listed
 * name).
 */

export type DisplayNameActionState =
  | { error: string }
  | { success: true }
  | null;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check the form and try again.";

export async function updateDisplayName(
  _prevState: DisplayNameActionState,
  formData: FormData,
): Promise<DisplayNameActionState> {
  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  // Auth only — deliberately NO role check: every authenticated user owns a
  // profiles row and may name themselves. RLS scopes the write to their own
  // row (auth.uid() = id); the role freeze is a BEFORE UPDATE trigger since
  // M11 (the WITH CHECK self-subquery was a policy-recursion partner).
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  // Row-count rule, same as everywhere: the profiles row should always exist
  // (signup's trigger mints it), but a 0-row UPDATE must be an error, not a
  // silent success.
  let updated: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    updated = data;
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }
  if (!updated) {
    return { error: "Your profile could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
