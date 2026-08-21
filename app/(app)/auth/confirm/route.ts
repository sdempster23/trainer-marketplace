import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/auth/safe-internal-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Email OTP confirmation route — the target of the links Supabase emails for
 * email confirmation (type=email) and password reset (type=recovery). It
 * exchanges the one-time `token_hash` for a session via verifyOtp, then lands
 * the user at `next`.
 *
 * LIVE for both types: signup confirmation (production has confirmation ON)
 * and the password-reset flow (launch-gate ruling 3, recovery template →
 * this route → /reset-password).
 *
 * SECURITY (launch-gate review finding): `next` is attacker-suppliable —
 * an unvalidated value here is an open redirect fired at the moment a
 * session is minted (phishing + session-fixation surface, since a valid
 * token_hash for the ATTACKER's account still authenticates). Only a
 * same-origin path is honored (safeInternalPath, shared with login).
 * `type` is likewise pinned to the two link types we actually email
 * instead of a blind cast.
 *
 * Current canonical pattern (verified against the Supabase docs): token_hash +
 * verifyOtp, NOT the older `?code=` + exchangeCodeForSession callback (that's
 * the PKCE/OAuth flow, deferred until we add social login).
 */

/** The only OTP types our emails ever link. Anything else → error page. */
const EMAILED_OTP_TYPES = ["email", "recovery"] as const satisfies
  readonly EmailOtpType[];

function emailedOtpType(value: string | null): EmailOtpType | null {
  return (EMAILED_OTP_TYPES as readonly string[]).includes(value ?? "")
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = emailedOtpType(searchParams.get("type"));
  const next = safeInternalPath(searchParams.get("next")) ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // Session established; land the user where the email link intended.
      redirect(next);
    }
  }

  // Missing/unknown params or a bad/expired token — the error fallback.
  redirect("/auth/auth-code-error");
}
