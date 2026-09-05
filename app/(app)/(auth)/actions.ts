"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { emitAnalyticsEvent } from "@/lib/analytics/events";
import { siteUrl } from "@/lib/site-url";
import { safeInternalPath } from "@/lib/auth/safe-internal-path";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

import {
  loginSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  signUpSchema,
} from "@/lib/validators/auth";

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
 * enabled and they must confirm before logging in. LIVE in production: hosted
 * has mailer_autoconfirm=false (confirmation ON), verified 2026-08-10 against
 * the Management API. The code still handles confirmation-off gracefully.
 */
const CHECK_EMAIL_REDIRECT = "/sign-up/check-email";
/** Where sign-out returns the user. */
const SIGNED_OUT_REDIRECT = "/login";

const GENERIC_ERROR = "Something went wrong. Please try again.";
/** Fallback when a zod result has no issue message (shouldn't happen, but the
 * index access is `undefined`-typed under noUncheckedIndexedAccess). */
const VALIDATION_ERROR = "Please check the form and try again.";

/** Boundary validation for the resend email (CLAUDE.md: zod at every input
 * boundary). Kept local — it's just an email shape, not a form schema. */
const resendSchema = z.string().trim().email();

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    consent: formData.get("consent"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  // Bot gate FIRST — before we touch auth. Fails closed + visible (a
  // Cloudflare outage blocks signup rather than letting bots through).
  const turnstile = await verifyTurnstile(formData.get("cf-turnstile-response"));
  if (!turnstile.ok) {
    return { error: turnstile.error };
  }

  const supabase = await createClient();

  let authError: string | null = null;
  let hasSession = false;
  let createdUserId: string | null = null;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // The M1 `handle_new_user` trigger reads role from raw_user_meta_data
        // and creates the matching profiles row. Lowercase — matches the enum.
        data: { role: parsed.data.role },
        // Confirmation is ON in production (hosted mailer_autoconfirm=false):
        // the emailed link routes through /auth/confirm and lands the user
        // here. Under confirmation-off this is simply unused.
        emailRedirectTo: siteUrl(POST_AUTH_REDIRECT),
      },
    });
    authError = error?.message ?? null;
    // Confirmation OFF → session present (log straight in). Confirmation ON →
    // session is null until the user confirms via email. Branching on this
    // keeps signUp correct under either dashboard setting, no rebuild needed.
    hasSession = Boolean(data.session);
    // Anti-enumeration fake-success (existing email) returns no user — skip
    // the event. Owner signups are a different funnel step; only trainer.
    createdUserId = data.user?.id ?? null;
  } catch {
    // Unexpected (network/transport) failure — surface a friendly message
    // rather than a 500. Auth failures themselves come back as `error`, above.
    authError = GENERIC_ERROR;
  }
  if (authError) {
    return { error: authError };
  }

  if (parsed.data.role === "trainer" && createdUserId) {
    const trainerId = createdUserId;
    after(() =>
      emitAnalyticsEvent({
        eventName: "trainer_signup",
        userId: trainerId,
      }),
    );
  }

  // Refresh any layout-cached, user-dependent data, then land the user.
  // redirect() MUST stay outside the try/catch — it signals via a thrown
  // NEXT_REDIRECT that a catch would swallow.
  revalidatePath("/", "layout");
  if (hasSession) {
    redirect(POST_AUTH_REDIRECT); // confirmation off (local option): straight in
  }
  redirect(CHECK_EMAIL_REDIRECT); // confirmation on (production): confirm via email
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
  redirect(safeInternalPath(formData.get("next")) ?? POST_AUTH_REDIRECT);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(SIGNED_OUT_REDIRECT);
}

export type ResendState = { error: string } | { sent: true } | null;

/**
 * Forgot-password request (launch-gate ruling 3). Same no-enumeration
 * posture as resendConfirmation: whether the address exists, is
 * unconfirmed, or the send failed transiently, the caller sees the same
 * "sent" state — the form copy says "if an account exists". A returned
 * (non-thrown) Supabase error — including a rate limit — is deliberately
 * swallowed too: GoTrue only actually sends (and therefore only
 * rate-limits) for addresses that EXIST, so surfacing "please wait"
 * would itself be an enumeration oracle. The emailed link uses the
 * recovery template's token_hash flow through /auth/confirm, which lands
 * the (now-authenticated) user on /reset-password.
 *
 * Turnstile-gated like signup (review finding): without it this form is a
 * free mailbox-bombing + email-quota-burning endpoint.
 */
export async function requestPasswordReset(
  _prevState: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: "Enter the email you signed up with." };
  }

  const turnstile = await verifyTurnstile(formData.get("cf-turnstile-response"));
  if (!turnstile.ok) {
    return { error: turnstile.error };
  }

  const supabase = await createClient();
  try {
    await supabase.auth.resetPasswordForEmail(parsed.data.email);
  } catch {
    // Never leak whether the address exists; a transient failure still
    // reports "sent" (the user can retry).
  }
  return { sent: true };
}

/**
 * Set the new password (the /reset-password form). Requires the session the
 * recovery link just established via /auth/confirm — without one, updateUser
 * fails and we point the user back at the request page (link expired, used
 * twice, or opened in a different browser).
 */
export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const supabase = await createClient();

  let authError: string | null = null;
  try {
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    // Supabase's messages here are user-appropriate ("New password should be
    // different from the old password.", session-missing) — pass through.
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

/**
 * Resend the signup confirmation email (the check-email page's button; the
 * stranger walkthrough exercises this). Deliberately does NOT reveal whether
 * the address exists or is already confirmed — Supabase's resend is a no-op in
 * those cases and we report the same "sent" either way (no account-enumeration
 * oracle). The confirmation link's origin comes from siteUrl() (the origin fix).
 */
export async function resendConfirmation(
  _prevState: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = resendSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Enter the email you signed up with." };
  }
  const supabase = await createClient();
  try {
    await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: siteUrl(POST_AUTH_REDIRECT) },
    });
  } catch {
    // Never leak whether the address exists; a transient failure still
    // reports "sent" (the user can retry).
  }
  return { sent: true };
}
