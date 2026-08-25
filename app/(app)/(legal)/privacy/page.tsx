/**
 * Privacy Policy — self-drafted at the launch gate (arc ruling 7), written
 * FROM the actual schema/processor inventory (docs/scratch investigation
 * B1/B2/B5), not from a template. STANDING RULE: every claim here must stay
 * true of the running system. If a data flow changes (new processor, new
 * table, analytics, marketing mail, on-platform payments), update this page
 * in the SAME arc — a stale privacy policy is worse than none.
 */
export const metadata = {
  title: "Privacy Policy — PawMatch",
  description: "How PawMatch collects, uses, and protects your information.",
};

const EFFECTIVE_DATE = "August 25, 2026";

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-4 text-[15px] leading-7 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
      <h1>Privacy Policy</h1>
      <p>Effective date: {EFFECTIVE_DATE}</p>
      <p>
        PawMatch (joinpawmatch.com) is a marketplace that connects dog owners
        with professional dog trainers. This policy describes exactly what
        information we collect, why, who touches it, and the choices you have.
        It is written to match how the product actually works today — nothing
        here is boilerplate.
      </p>

      <h2>Information you give us</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address, a password (stored
          only in hashed form by our authentication provider — we never see
          or store it in plain text), a display name, your role (owner or
          trainer), and an optional avatar image.
        </li>
        <li>
          <strong>Dog profiles (owners):</strong> your dog&apos;s name, breed,
          date of birth, temperament notes, and an optional photo. Visible to
          you and to trainers you interact with (for example, when you request
          a booking).
        </li>
        <li>
          <strong>Messages:</strong> the messages you exchange with the other
          party in a conversation, with read timestamps. Messages are visible
          only to the two participants. Our database access rules are
          configured so that even our own backend service role cannot read
          message bodies through the API layer.
        </li>
        <li>
          <strong>Bookings:</strong> who booked whom, the service, the time,
          the price at the time of booking, and status history (confirmed,
          cancelled, completed).
        </li>
        <li>
          <strong>Trainer business information (trainers):</strong> your bio,
          experience, certifications, specialties, services and prices, weekly
          availability, and an approximate service location with a service
          radius. This is public directory content by design — publish the
          service area you are comfortable sharing (for solo trainers an
          approximate point can resemble a home area, so choose accordingly).
        </li>
        <li>
          <strong>Payment instructions (trainers):</strong> free-text payment
          instructions and optional Venmo/PayPal usernames. These are handles
          only — PawMatch never collects card numbers or bank details and
          never processes money. An owner sees your payment instructions only
          after you confirm their booking.
        </li>
        <li>
          <strong>Calendar data (trainers, optional):</strong> if you connect
          an external calendar, the secret calendar URL you paste is stored
          server-side; it cannot be selected by any client-facing API role,
          and only our server&apos;s dedicated calendar-fetch path can
          retrieve it to check your busy times. From it we derive busy
          blocks that are start/end times only — no event titles, no
          attendees — refreshed about every 15 minutes and generated only
          for the near-term booking window. Outbound calendar feed links use
          tokens we store only in hashed form.
        </li>
      </ul>

      <h2>Information collected automatically</h2>
      <ul>
        <li>
          <strong>Server logs:</strong> our hosting providers keep standard
          request logs (IP address, request metadata) for operations and
          abuse prevention.
        </li>
        <li>
          <strong>Bot protection at signup:</strong> we use Cloudflare
          Turnstile to block automated signups. When you sign up, Turnstile
          receives your IP address and a challenge token.
        </li>
        <li>
          <strong>Aggregate usage analytics:</strong> we use Vercel Web
          Analytics to count page views. For each page view it records the
          page visited (including its query string, with sensitive parameters
          filtered out by Vercel), the referrer, your country, region, and
          city (derived from your IP address — Vercel states the IP itself is
          not stored), your browser, operating system, and device type, and an
          anonymized visitor identifier that resets every day and cannot be
          traced back to you across days or across sites. It is cookieless —
          it stores nothing on your device — and it is never linked to your
          account, name, or email. We see only aggregate counts, not
          individual browsing histories.
        </li>
        <li>
          <strong>Cookies:</strong> only strictly necessary cookies — your
          login session and Turnstile&apos;s challenge cookie. No advertising
          or analytics cookies (the analytics above is cookieless), no ads,
          and no tracking pixels.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>
        To operate the marketplace (search, profiles, messaging, bookings,
        calendars), to send transactional email (signup confirmation,
        password reset, booking updates, new-message notifications), to
        understand in aggregate which pages are visited, and to prevent
        abuse. We do not send marketing email, and we do not sell your
        information to anyone.
      </p>

      <h2>Who we share it with</h2>
      <h3>Service providers (processors)</h3>
      <ul>
        <li>
          <strong>Supabase</strong> (on AWS, US East) — our database and
          authentication, including delivery of some authentication emails.
        </li>
        <li>
          <strong>Vercel</strong> — hosting and content delivery, including
          server logs, and the usage analytics described above (Vercel Web
          Analytics).
        </li>
        <li>
          <strong>Resend</strong> — email delivery (the recipient address and
          the content of the emails we send you).
        </li>
        <li>
          <strong>Cloudflare</strong> — DNS for our domain, the Turnstile bot
          challenge at signup (your IP and a challenge token), and routing of
          email you send to our own addresses (such as
          privacy@joinpawmatch.com).
        </li>
      </ul>
      <p>
        If you connect an external calendar, we fetch busy times from the
        calendar URL you provide — that is us contacting your calendar
        provider at your direction, not your provider processing PawMatch
        data.
      </p>
      <h3>Other users</h3>
      <p>
        Marketplace counterparties see what the product shows them: owners
        see trainer directory profiles; a trainer you message or book sees
        your display name, your messages, relevant dog profile details, and
        the booking; an owner whose booking you confirm sees your payment
        instructions.
      </p>
      <p>
        We do not sell personal information, and we have no advertising
        partners. Our only analytics is the usage analytics described above.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Account data is kept while your account exists. Honest detail: account
        deletion is currently a manual process — email us at
        privacy@joinpawmatch.com and we will delete your account. Today,
        removing profiles and dogs uses soft-deletion (records are flagged
        deleted and hidden, not immediately purged). Messages are retained
        indefinitely (there is no message-deletion flow yet). Derived
        calendar busy blocks are generated only for the near-term booking
        window (roughly three weeks) and replaced on each refresh.
      </p>

      <h2>Your choices</h2>
      <p>
        You can access and edit your profile, dogs, services, and
        availability in the app. For a copy of your data, corrections we
        don&apos;t expose in the app, or deletion, email
        privacy@joinpawmatch.com — we will respond to every request.
      </p>

      <h2>Security</h2>
      <p>
        Every database table is protected by row-level security. Passwords
        are stored only as hashes. Calendar feed tokens are stored only as
        hashes. The calendar URL you paste cannot be selected by any
        client-facing API role — only our server&apos;s dedicated
        calendar-fetch path can retrieve it. No security is perfect, but
        access to your data is deliberately narrow by construction.
      </p>

      <h2>Age requirement</h2>
      <p>
        PawMatch is for adults: you must be 18 or older to create an account.
        We do not knowingly collect information from anyone under 18.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as the product changes. The effective date
        above always reflects the current version, and material changes will
        be noted on this page.
      </p>
      <p>
        <strong>August 25, 2026:</strong> we added cookieless, aggregate usage
        analytics (Vercel Web Analytics), described under &quot;Information
        collected automatically&quot;. Earlier versions of this policy stated
        we ran no analytics; that was true until this date.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and requests: privacy@joinpawmatch.com. General
        questions: hello@joinpawmatch.com.
      </p>
    </article>
  );
}
