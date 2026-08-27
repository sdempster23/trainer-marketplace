"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AVATARS_BUCKET,
  avatarObjectName,
  avatarStoredPath,
} from "@/lib/images/avatar";
import { sniffImageType } from "@/lib/images/sniff";
import { createClient } from "@/lib/supabase/server";
import { displayNameSchema } from "@/lib/validators/profile";
import type { Database } from "@/types/supabase";

/**
 * Account Server Actions — role-UNIVERSAL profile self-management. Neither
 * (owner) nor (trainer) is the right home (both roles have a name), and
 * (auth) is credential/session lifecycle, not profile data — so account gets
 * its own group. Residents: the /account "Your name" and "Your photo"
 * sections (both incidentally a trainer's post-onboarding way to edit what
 * the directory shows).
 */

export type DisplayNameActionState =
  | { error: string }
  | { success: true }
  | null;

export type AvatarActionState = { error: string } | { success: true } | null;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check the form and try again.";
const PROFILE_MISSING_ERROR = "Your profile could not be found.";

/**
 * The one own-row profiles write (review finding: this block had grown four
 * drifting copies). Returns a user-safe error message or null on success.
 * Contract points, pinned once here:
 *   - RLS scopes the write to the caller's row; no role check by design
 *     (every authenticated user owns a profiles row).
 *   - Row-count rule: a 0-row UPDATE is an error, never a silent success.
 *   - DB errors are LOGGED server-side and GENERICIZED for the UI — raw
 *     Postgres/PostgREST text names policies and columns (security.md:
 *     error messages don't leak internals).
 *   - No try/catch: postgrest-js resolves failures into { error }, it does
 *     not throw (verified against the installed client in review).
 */
async function updateOwnProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  patch: Database["public"]["Tables"]["profiles"]["Update"],
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[ACCOUNT] profiles update failed:", error.message);
    return GENERIC_ERROR;
  }
  if (!data) {
    return PROFILE_MISSING_ERROR;
  }
  return null;
}

export async function updateDisplayName(
  _prevState: DisplayNameActionState,
  formData: FormData,
): Promise<DisplayNameActionState> {
  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const writeError = await updateOwnProfile(supabase, userId, {
    display_name: parsed.data,
  });
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * The BLOCKING name step (front-door arc): a freshly verified user with no
 * display_name sets it before reaching the app. One field, Continue, NO skip
 * — /welcome renders this, /account bounces a nameless user back to it. On
 * success, land at /account.
 */
export async function setInitialDisplayName(
  _prevState: DisplayNameActionState,
  formData: FormData,
): Promise<DisplayNameActionState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const writeError = await updateOwnProfile(supabase, userId, {
    display_name: parsed.data,
  });
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  redirect("/account");
}

/**
 * Commit an already-uploaded avatar (role-universal, like the name).
 *
 * TRANSPORT SPLIT (investigation §3): the FILE never rides this action —
 * a 12MB phone photo exceeds Server Action body limits, so the client
 * re-encodes (512px, EXIF stripped) and uploads DIRECT to storage under the
 * M18 RLS exact-path law. This action is the trust boundary that runs
 * AFTER: it takes NO client input at all (the object name derives from the
 * caller's JWT — nothing to validate because nothing is accepted),
 * magic-byte-sniffs the object the caller claims to have uploaded, and only
 * then writes the profiles.avatar_url pointer. A hostile direct upload that
 * skips this action is never rendered (publicAvatarUrl re-validates at
 * render), and one that fails the sniff is deleted here.
 */
export async function commitAvatar(): Promise<AvatarActionState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const objectName = avatarObjectName(userId);

  // Download under the caller's own RLS (avatars_select_own) — no admin
  // client, no trust in any client-supplied path.
  const { data: blob, error: downloadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .download(objectName);
  if (downloadError || !blob) {
    return { error: "We couldn't find your uploaded photo. Try again." };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // The byte-level check the bucket's Content-Type validation cannot do
  // (never trust the extension OR the header). Failure deletes the object
  // AND nulls the pointer: on a REPLACE, the upsert already overwrote the
  // one shared object, so leaving the old pointer would render a 404
  // everywhere (review finding — "failure leaves the current avatar
  // untouched" cannot survive a failed replace; honest removal can).
  if (sniffImageType(bytes) === null) {
    const { error: removeError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove([objectName]);
    if (removeError) {
      // Log loudly: a mislabeled non-image lingering at a public URL is
      // exactly what this branch exists to prevent (review finding — the
      // resolved error was silently discarded before).
      console.error(
        "[AVATAR] sniff-fail cleanup could not remove object:",
        removeError.message,
      );
    }
    const pointerError = await updateOwnProfile(supabase, userId, {
      avatar_url: null,
    });
    if (pointerError) {
      return { error: pointerError };
    }
    revalidatePath("/", "layout");
    return {
      error: "That file isn't a JPEG, PNG, or WebP image. Try another photo.",
    };
  }

  // Pointer write with the cache-buster version (the public URL is
  // CDN-cached; same-name upsert without ?v= would serve the old photo).
  const writeError = await updateOwnProfile(supabase, userId, {
    avatar_url: avatarStoredPath(userId, Date.now()),
  });
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Remove the avatar: pointer first (the UI's truth changes immediately),
 * object second (investigation §5 order). If the object delete fails, the
 * orphan sits invisible at the fixed path and the next upload overwrites it
 * — never a stale RENDER, which is the failure that would matter.
 */
export async function removeAvatar(): Promise<AvatarActionState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const writeError = await updateOwnProfile(supabase, userId, {
    avatar_url: null,
  });
  if (writeError) {
    return { error: writeError };
  }

  const { error: removeError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .remove([avatarObjectName(userId)]);
  if (removeError) {
    // Pointer is already gone; the orphaned object is invisible and
    // self-healing on next upload. Logged so a pattern of failures shows.
    console.error(
      "[AVATAR] remove could not delete object:",
      removeError.message,
    );
  }

  revalidatePath("/", "layout");
  return { success: true };
}
