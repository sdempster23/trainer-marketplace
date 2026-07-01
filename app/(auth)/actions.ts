"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginSchema, signUpSchema } from "@/lib/validators/auth";

/**
 * Auth Server Actions — the trusted boundary. Forms are convenience; THIS is
 * where input is validated (zod) and credentials touch Supabase.
 *
 * Why Server Actions (not the browser client in a client form): a Server Action
 * runs the server Supabase client, whose `setAll` writes the rotated session
 * cookie — and unlike a Server Component render, a Server Action IS allowed to
 * write cookies, so sign-up / sign-in persist the session correctly.
 */

/**
 * Serializable state for `useActionState`. `null` is idle/initial; a populated
 * `error` renders inline on the form. Success never returns a value — the
 * action calls `redirect()`, which throws `NEXT_REDIRECT` internally.
 */
export type AuthActionState = { error: string } | null;

/** Where a freshly authenticated user lands (placeholder authed page, built next group). */
const POST_AUTH_REDIRECT = "/account";
/**
 * Where signup sends a user who has NO session yet — i.e. email confirmation is
 * enabled and they must confirm before logging in. Dormant while confirmation
 * is OFF (signUp returns a session immediately, so this branch never runs).
 */
const CHECK_EMAIL_REDIRECT = "/sign-up/check-email";
/** Where sign-out returns the user. */
const SIGNED_OUT_REDIRECT = "/login";

const GENERIC_ERROR = "Something went wrong. Please try again.";
/** Fallback when a zod result has no issue message (shouldn't happen, but the
 * index access is `undefined`-typed under noUncheckedIndexedAccess). */
const VALIDATION_ERROR = "Please check the form and try again.";

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const supabase = await createClient();

  let authError: string | null = null;
  let hasSession = false;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // The M1 `handle_new_user` trigger reads role from raw_user_meta_data
        // and creates the matching profiles row. Lowercase — matches the enum.
        data: { role: parsed.data.role },
        // Dormant while email confirmation is OFF (signUp returns a session
        // immediately). When confirmation is enabled, the emailed link routes
        // through /auth/confirm and lands the user here.
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}${POST_AUTH_REDIRECT}`,
      },
    });
    authError = error?.message ?? null;
    // Confirmation OFF → session present (log straight in). Confirmation ON →
    // session is null until the user confirms via email. Branching on this
    // keeps signUp correct under either dashboard setting, no rebuild needed.
    hasSession = Boolean(data.session);
  } catch {
    // Unexpected (network/transport) failure — surface a friendly message
    // rather than a 500. Auth failures themselves come back as `error`, above.
    authError = GENERIC_ERROR;
  }
  if (authError) {
    return { error: authError };
  }

  // Refresh any layout-cached, user-dependent data, then land the user.
  // redirect() MUST stay outside the try/catch — it signals via a thrown
  // NEXT_REDIRECT that a catch would swallow.
  revalidatePath("/", "layout");
  if (hasSession) {
    redirect(POST_AUTH_REDIRECT); // confirmation off (today): straight in
  }
  redirect(CHECK_EMAIL_REDIRECT); // confirmation on (later): confirm via email
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const supabase = await createClient();

  let authError: string | null = null;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    authError = error?.message ?? null;
  } catch {
    authError = GENERIC_ERROR;
  }
  if (authError) {
    return { error: authError };
  }

  revalidatePath("/", "layout");
  redirect(POST_AUTH_REDIRECT);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(SIGNED_OUT_REDIRECT);
}
