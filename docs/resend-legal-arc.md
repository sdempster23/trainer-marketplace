# Resend SMTP + Legal Pages — arc plan (launch gate)

Durable record. The read-only investigation lives in
`docs/scratch/resend-legal-investigation-2026-07-31.md` (scratch,
disposable — its findings are summarized here where load-bearing).
Rulings issued by Shane 2026-08-10 after QA of that doc; recorded here
because the previous sitting's rulings were chat-only and evaporated.

---

## The seven rulings (2026-08-10, Shane)

1. **Senders — split identity.** `hello@joinpawmatch.com` for APP mail
   (booking transitions + message doorbell — replies are a feature at
   this stage); `noreply@joinpawmatch.com` for AUTH mail. Both
   addresses must actually receive mail (email forwarding, Stop 3 of
   the sitting). Therefore: Vercel `EMAIL_FROM=hello@joinpawmatch.com`;
   Supabase SMTP sender = `noreply@joinpawmatch.com`.
2. **Supabase config: dashboard sitting** (investigation A8-4b). No
   hands-free Management-API PATCH — the SMTP password IS the Resend
   API key, and credentials stay in Shane's hands.
3. **Forgot-password JOINS this arc.** Request page → email → reset
   page, on Supabase's existing recovery template (no custom recovery
   template this arc).
4. **Age gate: 18+** (contract capacity + protection-sport context —
   not just COPPA hygiene).
5. **Consent: checkbox at signup**, unchecked by default, linking ToS
   + Privacy Policy. Not agree-by-signup.
6. **Privacy contact: `privacy@joinpawmatch.com`** (forwarded, Stop 3 —
   since 2026-09-04 a Workspace alias; the address is unchanged).
7. **Lawyer: self-draft now, truthful and live.** Carry the
   investigation's B4 flags — dog-bite/injury liability language,
   independent-contractor status, arbitration/venue — to the
   pre-club-pitch list beside the trademark filing. Include a standard
   "terms may be updated" line.

## Pre-club-pitch carry list (do BEFORE pitching the club)

- Lawyer review of ToS: injury/assumption-of-risk clauses (bite-work
  marketplace — the highest-stakes language in the document),
  independent-contractor/no-agency language, arbitration + TN venue
  enforceability.
- Trademark filing (carried from the design arc).
- Liability-insurance question for PawMatch itself before first real
  bookings.

---

## Shane's ONE-SITTING dashboard checklist (updated for ruling 1)

**Stop 1 — Resend (resend.com)**
1. Domains → Add `joinpawmatch.com` → region **us-east-1** (matches
   Supabase). Leave the panel open — it shows the DNS values.
2. API Keys → Create: name `pawmatch-production`, permission
   **Sending access** → copy the `re_...` key once.

**Stop 2 — Cloudflare DNS (joinpawmatch.com zone)** — all records
**DNS-only (gray cloud)**, values copied from the open Resend panel:

| Type | Name | Value |
|---|---|---|
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority `10` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | `p=<DKIM key from the Resend panel — unique per domain>` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

Then back in Resend: **Verify** (propagation usually minutes).

**Stop 3 — Cloudflare Email Routing (same zone)** — ruling 1 & 6
require both addresses to RECEIVE:
> **SUPERSEDED 2026-09-04.** Email Routing is disabled and its apex
> records removed; hello@ and privacy@ are now Google Workspace
> aliases on shane@joinpawmatch.com. Kept for the record of the
> 2026-08-13 sitting — see the 2026-09-04 addendum at the end.
1. Email → Email Routing → enable. Cloudflare adds its own MX + SPF
   at the APEX — no conflict with Resend's records (those live on the
   `send` subdomain; the apex had no MX at all).
2. Create `hello@joinpawmatch.com` AND `privacy@joinpawmatch.com` →
   forward to Shane's inbox → click the destination-verification email.

**Stop 4 — Vercel** (trainer-marketplace → Settings → Environment
Variables, **Production AND Preview**):
- `RESEND_API_KEY` = the new `re_...` key
- `EMAIL_FROM` = `hello@joinpawmatch.com`  ← ruling 1 (app mail)
- `EMAIL_FROM_NAME` = `PawMatch`
- Redeploy after saving so the vars take.

**Stop 5 — Supabase dashboard** (ruling 2: manual, no API PATCH):
1. Project Settings → Authentication → SMTP: host `smtp.resend.com` ·
   port `465` · username literal `resend` · password = the same
   `re_...` key · sender **`noreply@joinpawmatch.com`** ← ruling 1
   (auth mail) · sender name `PawMatch`. (Sender must be on the
   verified domain — unverified is rejected.)
2. Authentication → Rate Limits → emails: **100/hour** (from 2 —
   only safe to raise once custom SMTP is on).
3. Authentication → Email Templates → Confirm signup: subject
   **"Confirm your PawMatch account"**, body pasted from
   `supabase/templates/confirmation.html` (token_hash flow;
   `/auth/confirm` is already live in prod).
4. Authentication → Email Templates → Reset password: subject stays
   **"Reset Your Password"** (stock), body pasted from
   `supabase/templates/recovery.html`. NOTE — deviation from ruling
   3's letter, mechanics-forced: the stock template's
   `{{ .ConfirmationURL }}` needs the PKCE `?code=` callback the repo
   deliberately deferred (and breaks when the link opens in a
   different browser). The paste keeps Supabase's stock copy and
   subject; only the link switches to the repo-canonical
   token_hash → `/auth/confirm` flow the confirmation template
   already uses.
5. Authentication → toggle **"Secure password change"** ON (review
   finding, mirrored in local config.toml: without it, any stolen
   session cookie can silently set a new password; the reset flow is
   unaffected because its recovery session is seconds old).

Rollback if SMTP misbehaves: clear the SMTP host — the built-in
mailer resumes (at 2/hour) within a minute.

---

## Build scope (this arc, branch `feat/email-legal-gate`)

1. **Legal pages** `/privacy` + `/terms`, drafted FROM the schema
   inventory (investigation B1/B2/B5): Turnstile listed as an ACTIVE
   processor (visitor IP + challenge token at signup); soft-delete
   described honestly (deletion is a manual email request until a
   self-serve flow exists); the calendar privacy story told plainly
   (capability-URL never API-readable, busy times only, hashed feed
   tokens); no Stripe as a current processor; no analytics/ads — say
   so. 18+ requirement (ruling 4). Contact: privacy@ (ruling 6).
   "Terms may be updated" line (ruling 7).
2. **Footer links** to /terms + /privacy (homepage + app pages) and a
   **signup consent checkbox** — unchecked by default, links both
   documents, 18+ attestation, validated server-side (ruling 5).
3. **Forgot-password flow** (ruling 3): `/forgot-password` request
   page → `resetPasswordForEmail` → recovery link through
   `/auth/confirm` → `/reset-password` page → `updateUser`. Same
   no-account-enumeration posture as resendConfirmation.
4. **Housekeeping while in the files:** fix the stale "confirmation is
   OFF on hosted" comment in `app/(auth)/actions.ts` (it is ON);
   update `.env.example` EMAIL_FROM guidance to the ruled split.

Review gate per commit (code review of the diff; CRITICAL/HIGH fixed
before the commit lands). Never push to main — PR at the end.

## Live proof (arc exit — BOTH rails + reset, after Shane's sitting)

1. **Auth rail:** real signup with a fresh gmail alias → confirmation
   arrives FROM joinpawmatch.com via Resend (custom subject proves the
   template took) → link confirms → account works.
2. **App rail:** trigger a real booking/message email in production —
   delivered (not log-mode) from `hello@joinpawmatch.com`. Production
   app mail has NEVER been lit; this is its first positive proof.
   (`delivered@resend.dev` is available for plumbing checks that
   shouldn't touch a real inbox.)
3. **Recovery rail:** full password-reset round trip in production —
   request → email arrives → reset → sign in with the new password.
4. Cleanup: delete test users via the admin API (established pattern).

---

## ADDENDUM 2026-08-25 — the "no analytics" invariant is retired

The inventory above (build-scope item 1) and the underlying
investigation (docs/scratch/resend-legal-investigation-2026-07-31.md,
"No analytics, no Sentry, no ads") were true when written and through
2026-08-24. As of the observability change (branch
`feat/observability-analytics`), the app runs **Vercel Web Analytics**
— cookieless, aggregate page-view counting, wired in
`app/layout.tsx`. `/privacy` was updated in the same change (new
analytics bullet, Vercel processor entry extended, dated change note)
per its standing rule. Do NOT "correct" the privacy page back to the
no-analytics claim on the strength of this document — the current
inventory is the privacy page itself plus this addendum.

---

## ADDENDUM 2026-09-04 — inbound mail moved to Google Workspace

Stop 3 above (Cloudflare Email Routing) is retired. What changed, and
what did not:

- **Inbound (apex):** `joinpawmatch.com` MX is now `smtp.google.com`
  (Google Workspace). Cloudflare Email Routing is disabled and its apex
  MX + SPF records are removed. `hello@joinpawmatch.com` and
  `privacy@joinpawmatch.com` are aliases on the Workspace mailbox
  `shane@joinpawmatch.com` — they still receive, so rulings 1 and 6
  hold and `/privacy` + `/terms` stay true without a copy change.
- **Outbound app + auth mail (send subdomain):** UNCHANGED. Resend's
  records (`send` MX + SPF, `resend._domainkey` DKIM) live on the
  subdomain and were not touched; `EMAIL_FROM=hello@` (app) and the
  Supabase SMTP sender `noreply@` (auth) keep riding Resend. DNS
  re-checked 2026-09-04 (all four Resend records resolve unchanged);
  a post-cutover LIVE send is still owed — see the manual-steps
  "Inbound mail" section.
- **Replies from Shane** now go out through Workspace from the apex,
  which puts a SECOND sender on the domain. DMARC (`_dmarc` p=none)
  covers both. Google DKIM (`google._domainkey`, 2048-bit) is published
  and verified as of 2026-09-04; the apex SPF
  (`include:_spf.google.com`) is still missing, and the pending
  p=quarantine revisit waits on it — see manual-steps for the observed
  DNS state.
