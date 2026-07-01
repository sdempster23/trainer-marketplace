import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Email OTP confirmation route — the target of the links Supabase emails for
 * email confirmation (type=email) and password reset (type=recovery). It
 * exchanges the one-time `token_hash` for a session via verifyOtp, then lands
 * the user at `next`.
 *
 * DORMANT while email confirmation is OFF (signup returns a session directly,
 * so no email is sent and nothing hits this route). Built now so the
 * confirmation-on path — and password reset later — is complete, not half-wired.
 * Activating it is a Supabase dashboard config only (email template → this URL);
 * see docs/manual-steps.md. No code change needed to flip confirmation on.
 *
 * Current canonical pattern (verified against the Supabase docs): token_hash +
 * verifyOtp, NOT the older `?code=` + exchangeCodeForSession callback (that's
 * the PKCE/OAuth flow, deferred until we add social login).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // Session established; land the user where the email link intended.
      redirect(next);
    }
  }

  // Missing params or a bad/expired token — send to the error fallback.
  redirect("/auth/auth-code-error");
}
