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
  `iomaiasjqozunjbvsdsk`) is at **migration M13** — the full M1→M13 schema was
  pushed (`supabase db push`) so the deployed app has every table the code
  expects (identity, dogs, trainers, services/availability, stripe accounts,
  bookings, messaging + read-state + thread counterparty read, the nearby_trainers RPC, busy ranges). Anyone pointing
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
- **Hosted/production (live since 2026-08-13):** verify a domain in Resend
  (SPF + DKIM DNS on the `send` subdomain), set `EMAIL_FROM=hello@<domain>`
  (ruling 1 in docs/resend-legal-arc.md — `noreply@` is the Supabase AUTH
  sender, not the app sender), and add
  `RESEND_API_KEY` **and `SUPABASE_SERVICE_ROLE_KEY`** to Vercel env
  (Preview + Production) — the service key is now read server-side for
  recipient-email lookup (lib/supabase/admin.ts; see its header for why
  emails must NOT be denormalized into profiles).

## Inbound mail — hello@ / privacy@ (Google Workspace, since 2026-09-04)

The addresses the legal pages publish (`hello@joinpawmatch.com`,
`privacy@joinpawmatch.com`) must actually receive mail (rulings 1 and 6).
The mechanism behind them changed on 2026-09-04; the addresses did not.

- **Current:** Google Workspace. Apex MX = `smtp.google.com`. `hello@` and
  `privacy@` are aliases on the Workspace mailbox `shane@joinpawmatch.com`
  — managed in the Google Admin console, not in DNS.
- **Retired:** Cloudflare Email Routing (the 2026-08-13 sitting's Stop 3).
  Disabled, and its apex MX + SPF records removed. Don't re-enable it — a
  second apex MX would race Google for inbound.
- **Who owns which DNS record** (all on the joinpawmatch.com zone):

  | Record | Owner | Purpose |
  |---|---|---|
  | apex `MX` → `smtp.google.com` | Workspace | inbound to hello@/privacy@/shane@ |
  | apex `TXT` google-site-verification | Workspace | domain proof |
  | `send` `MX` + `TXT` (spf1 amazonses) | Resend | app + auth OUTBOUND |
  | `resend._domainkey` `TXT` | Resend | DKIM for Resend sends |
  | `google._domainkey` `TXT` | Workspace | DKIM for Workspace sends (2048-bit, published 2026-09-04) |
  | `_dmarc` `TXT` (p=none) | shared | policy for BOTH senders |

- **Workspace DKIM — CLOSED 2026-09-04.** `google._domainkey` resolves
  from Cloudflare's authoritative NS, 1.1.1.1 and 8.8.8.8 as a `v=DKIM1`
  RSA record; the key parses as 2048-bit (the two quoted strings are the
  normal 255-char DNS split, not truncation). Authenticated in the
  Workspace admin console.
- **Apex SPF — STILL OPEN (Shane, Cloudflare DNS):** the apex has NO
  `v=spf1` record (verified 2026-09-04 against the same three resolvers;
  the only apex TXT is google-site-verification). Cloudflare's SPF left
  with Email Routing and nothing replaced it. Publish
  `TXT @ "v=spf1 include:_spf.google.com ~all"`. Until then Workspace
  mail from hello@/privacy@/shane@ passes DKIM but not SPF; p=none means
  nothing is rejected today, but the DMARC p=quarantine revisit (email-arc
  launch item) stays BLOCKED on this one record. Resend's `send`
  subdomain is unaffected either way.
- **App/auth outbound is independent of all this:** it rides the `send`
  subdomain. Post-cutover DNS re-check 2026-09-04: `send` MX/SPF,
  `resend._domainkey`, `_dmarc` all resolve unchanged. **OWED:** one real
  app email in production after the cutover (the doorbell fired by the
  images-arc phone walk counts) with its Resend delivery record — DNS
  is theory, the delivery record is the proof.

## Analytics (Vercel Web Analytics)

- **One-time dashboard enable (Shane):** Vercel dashboard →
  vercel.com → select the **trainer-marketplace** project → **Analytics**
  tab (left sidebar of the project view) → click **Enable**. Free (Hobby)
  tier; no env vars, no keys. Until this is toggled, the `<Analytics />`
  component in `app/layout.tsx` sends nothing useful — the collection
  endpoint only activates once the project has Analytics enabled.
- **Verify after the next deploy:** visit the production site, then check
  the Analytics tab — the first page views appear within a minute or two.
  Local dev never sends data (the script is a no-op outside Vercel
  deployments), so don't look for it on localhost.
- **Standing rule reminder:** the privacy policy's analytics section
  (app/(app)/(legal)/privacy/page.tsx) describes exactly what this
  collects. If analytics ever expands (custom events, Speed Insights,
  another provider), update /privacy in the same change.

## Account deletion runbook (manual — the privacy page promises this)

The privacy policy says deletion via privacy@ "includes your uploaded
photos". No database cascade reaches storage (storage.objects has no FK
to app tables, and direct SQL DELETE wouldn't remove the backing files
anyway — the platform blocks it; deletion must go through the Storage
API or dashboard). The manual order:

1. **Storage first:** dashboard → Storage, delete the user's folder in
   BOTH buckets — `avatars/{uid}/` and `trainer-gallery/{uid}/` (either
   may be empty; a missing folder is fine).
2. **Then the auth user:** admin-API delete of the auth.users row (the
   established test-user pattern) — cascades profiles → trainers →
   listing data. RESTRICT FKs (dogs, bookings, threads, messages) will
   FAIL the delete for a user with history: clean those up deliberately
   first (FK-ordered, the walk-account sweep pattern). Never disable
   constraints to force it.
3. **Verify:** run docs/marketplace-state.sql — section 6's MISMATCH
   rows must not appear afterward. LIMIT of that check: it reconciles
   AVATARS only — the gallery has no pointer table yet (it lands with
   the gallery feature), so a missed `trainer-gallery/{uid}/` folder
   produces NO mismatch row. Until gallery reconciliation exists,
   visually confirm in dashboard → Storage that the user's gallery
   folder is gone; the section-6 "gallery objects" count dropping by
   the expected amount is the corroborating signal.

## Image moderation (manual-with-visibility — gate ruling 4)

Uploads are published as submitted; there is no review queue (the
privacy page says exactly this — don't add copy anywhere implying
proactive review). Visibility is the routine: every upload is browsable
in dashboard → Storage, and marketplace-state.sql section 6 counts
avatars and gallery objects, so new images surface in the query Shane
already runs. Removal path for a problem image: delete the object in
the dashboard AND null the pointer — for an avatar that's
profiles.avatar_url; for a gallery image there is NO pointer row until
the gallery feature lands (deleting the object is the whole removal
today — re-verify this line against the real table when it ships).
Pointer-only removal leaves the file publicly fetchable.
