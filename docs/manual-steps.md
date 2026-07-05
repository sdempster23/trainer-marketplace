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
  `iomaiasjqozunjbvsdsk`) is at **migration M10** — the full M1→M10 schema was
  pushed (`supabase db push`) so the deployed app has every table the code
  expects (identity, dogs, trainers, services/availability, stripe accounts,
  bookings, messaging + read-state, the nearby_trainers RPC). Anyone pointing
  the app at hosted dev has a complete, grant-hardened schema.
- **Local dev runs against the LOCAL stack by default** (decided 2026-07-02).
  `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` / anon key / service-role key
  at `supabase start`'s stack; the hosted values live in `.env.local` as
  labeled comments and in **Vercel env settings** (Preview + Production), which
  is the only place deployments read them from. Why: pointing `pnpm dev` at
  hosted makes every local manual test write real rows to the shared hosted
  project — and hosted GoTrue's default SMTP cap (2 emails/hour) rate-limits
  signup testing almost immediately. Discovered during the Group-C live proof.
- **If you ever need local-against-hosted** (rare — e.g. reproducing a
  hosted-only bug), do it with an explicit shell override and say why in the
  session/PR notes, e.g.:
  `NEXT_PUBLIC_SUPABASE_URL=https://iomaiasjqozunjbvsdsk.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<hosted-anon-key> pnpm dev`
  — never by editing `.env.local` back. The override dies with the shell; an
  edit silently persists for every future session.

- **Local-stack quirk: permission-DENIED function calls SEGFAULT the local
  Postgres** (the supabase db image, PG 17.6 — verified surviving the CLI
  v2.109 upgrade, which doesn't replace an already-present db image). Any
  role calling a function it lacks EXECUTE on kills the backend (crash-
  recovery brings it back; committed data is safe). Repro:
  `create function public._t() returns int language sql as 'select 1';
  revoke execute on function public._t() from public, anon, authenticated;`
  then `set role anon; select public._t();` — a clean 42501 means a future
  image fixed it; a dropped connection means it hasn't. Consequences: test
  suites assert EXECUTE denial via `has_function_privilege()` ONLY (the
  catalog-only convention — M12 journal entry has the full story), never a
  live denied call. Hosted is unaffected. Escalation if it ever matters:
  force a fresh db image pull / newer image pin — not a CLI bump.

## Email (transition notifications)

- **Local:** no setup — with the Phase-0 placeholder key, the mail seam runs
  in `[MAIL:LOG-MODE]` and prints rendered emails to the dev-server log.
- **Real sends without a domain:** put a real `RESEND_API_KEY` in
  `.env.local`; `onboarding@resend.dev` (the test-only from) can then
  deliver ONLY to the Resend account owner's own address, plus the
  `*@resend.dev` test recipients (delivered@/bounced@/complained@/
  suppressed@, `+label` supported).
- **Hosted/production (when it matters):** verify a domain in Resend
  (SPF + DKIM DNS), set `EMAIL_FROM=noreply@<domain>`, and add
  `RESEND_API_KEY` **and `SUPABASE_SERVICE_ROLE_KEY`** to Vercel env
  (Preview + Production) — the service key is now read server-side for
  recipient-email lookup (lib/supabase/admin.ts; see its header for why
  emails must NOT be denormalized into profiles).
