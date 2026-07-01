# Manual setup steps

Configuration that lives **outside the repo** — dashboard toggles, email
templates, deploy settings — that a code deploy alone won't apply. Keep this
current as features that need external config land (see CLAUDE.md "Definition of
done" item 8).

---

## Auth

### Email confirmation (currently OFF in dev)

Signup works today with confirmation **off**: `supabase.auth.signUp` returns a
session immediately and the user lands in `/account`. The `/auth/confirm` route
and `/sign-up/check-email` page are built but **dormant**.

**To turn confirmation ON** (production, or to test the flow in dev):

1. Supabase dashboard → **Authentication → Providers → Email** → enable
   **"Confirm email"**.
2. Supabase dashboard → **Authentication → Email Templates → Confirm signup** →
   point the confirmation link at our confirm route:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account
   ```

3. For **password reset**, the **Reset Password** template uses the **same
   route** with `type=recovery`:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password
   ```

   (The `/account/update-password` surface is a later branch; the route itself
   already handles `type=recovery`.)

**No code change is needed to toggle confirmation.** The signup action already
branches on `data.session`: session present (confirmation off) → straight to
`/account`; session absent (confirmation on) → `/sign-up/check-email`. Flipping
the dashboard setting is the only step.

> Uses `token_hash` + `verifyOtp`, the current canonical email-OTP pattern —
> **not** the older `?code=` + `exchangeCodeForSession` callback (that's the
> PKCE/OAuth flow, deferred until we add social login).

---

## Known / accepted build warnings

### Supabase-on-Edge middleware warning (accepted)

`pnpm build` emits one benign warning:

```
A Node.js API is used (process.version) which is not supported in the Edge Runtime.
  @supabase/supabase-js → @supabase/ssr → lib/supabase/middleware.ts
```

**Cause:** Next.js middleware defaults to the Edge runtime; `supabase-js`
touches `process.version` in a guarded runtime-detection path. Build and deploy
succeed; the middleware works. This is the well-known Supabase+Next middleware
warning.

**Decision:** **accepted for now** (keeps the runtime choice out of the auth
feature work). **Fix if wanted:** add `export const config = { runtime: "nodejs" }`
to `middleware.ts` — stable on Next 15.5+ (may require
`experimental.nodeMiddleware` in `next.config`; verify before adopting). It
**resolves on its own at Next 16**, where the Node.js runtime becomes the
middleware default.

---

## Environment / database

- **Hosted dev Supabase project** (`trainer-marketplace-dev`, ref
  `iomaiasjqozunjbvsdsk`) is at **migration M9** — the full M1→M9 schema was
  pushed (`supabase db push`) so the deployed app has every table the code
  expects (identity, dogs, trainers, services/availability, stripe accounts,
  bookings, messaging + read-state). Anyone pointing the app at hosted dev has a
  complete, grant-hardened schema.
- `.env.local` targets the hosted dev project (`NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`). For a fully local stack instead, run
  `supabase start` and swap in the local URL/anon key (commented hints in
  `.env.local`).
