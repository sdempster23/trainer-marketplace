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

const EFFECTIVE_DATE = "August 26, 2026";

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
          trainer), and an optional profile photo. When you add a photo in
          the app, your browser resizes and re-encodes it before it is
          uploaded — this removes the file&apos;s embedded metadata,
          including any GPS location your camera recorded, before the file
          leaves your device. Photos are served from public storage (anyone
          with the link can view them) and are published as you submit
          them: we do not review images before they appear, and we remove
          images we become aware violate our terms.
        </li>
        <li>
          <strong>Dog profiles (owners):</strong> your dog&apos;s name, breed,
          date of birth, and temperament notes. Visible to you and to
          trainers you interact with (for example, when you request a
          booking). (There is no dog-photo upload today; if we add one,
          we&apos;ll update this policy.)
        </li>
        <li>
          <strong>Messages:</strong> the messages you exchange with the other
          party in a conversation, with read timestamps. Messages are visible
          only to the two participants. Our database access rules are
          configured so that even our own backend service role cannot read
          message bodies through the API layer. One flow leaves that system:
          the new-message notification email includes a short preview of the
          message (up to 160 characters), delivered like all our email
          through Resend to the recipient&apos;s inbox.
        </li>
        <li>
          <strong>Bookings:</strong> who booked whom, the service, the time,
          the price at the time of booking, and status history (confirmed,
          cancelled, completed).
        </li>
        <li>
          <strong>Trainer business information (trainers):</strong> your bio,
          experience, certifications, specialties, services and prices, weekly
          availability, an approximate service location with a service
          radius, and any training photos you publish to your profile
          gallery (the same photo rules above apply: metadata stripped by
          the app&apos;s uploader, public storage, published as submitted).
          This is public directory content by design — publish the service
          area and photos you are comfortable sharing (for solo trainers an
          approximate point can resemble a home area, and a photo taken at
          home can show it, so choose accordingly).
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
          attendees — refreshed when your availability is viewed (at most
          once per 15 minutes) and generated only for the near-term booking
          window. Outbound calendar feed links use tokens we store only in
          hashed form.
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
          <strong>Bot protection:</strong> we use Cloudflare Turnstile to
          block automated signups and password-reset requests. When you
          submit either of those forms, Turnstile receives your IP address
          and a challenge token.
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
          <strong>Supabase</strong> (on AWS, US East) — our database,
          authentication (including delivery of some authentication emails),
          and file storage for uploaded photos.
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
          challenge at signup and password reset (your IP and a challenge
          token), and routing of email you send to our own addresses (such
          as privacy@joinpawmatch.com).
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
        see trainer directory profiles (including the trainer&apos;s profile
        photo); a trainer you message or book sees your display name, your
        profile photo if you set one, your messages, relevant dog profile
        details, and the booking; an owner whose booking you confirm sees
        your payment instructions.
      </p>
      <p>
        We do not sell personal information, and we have no advertising
        partners. Our only analytics is the usage analytics described above.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Account data is kept while your account exists. Honest detail:
        account deletion is currently a manual process — email us at
        privacy@joinpawmatch.com and we will delete your account, including
        your uploaded photos; there is no self-serve deletion yet. In the
        app today, removing dogs and services uses soft-deletion (records
        are flagged deleted and hidden, not immediately purged). Replacing
        your profile photo overwrites the old image file, and removing it
        deletes the file from storage. Messages are retained indefinitely
        (there is no message-deletion flow yet). Derived calendar busy
        blocks are generated only for the near-term booking window (roughly
        three weeks) and replaced on each successful refresh; if your
        profile isn&apos;t viewed for a while, the last-derived blocks
        simply sit until the next view refreshes them or you disconnect the
        calendar.
      </p>

      <h2>Your choices</h2>
      <p>
        You can access and edit your profile (including your photo), dogs,
        services, and availability in the app. For a copy of your data, corrections we
        don&apos;t expose in the app, or deletion, email
        privacy@joinpawmatch.com — we will respond to every request.
      </p>

      <h2>Security</h2>
      <p>
        Every database table is protected by row-level security. Passwords
        are stored only as hashes. Calendar feed tokens are stored only as
        hashes. The calendar URL you paste cannot be selected by any
        client-facing API role — only our server&apos;s dedicated
        calendar-fetch path can retrieve it. Uploaded photos can only be
        written to your own storage folder, and photos added through the
        app are content-verified — not just checked by name or declared
        type — before your profile points to them. No security is perfect,
        but access to your data is deliberately narrow by construction.
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
        <strong>August 26, 2026:</strong> we added photos (profile photos
        and trainer gallery photos). New: what photos we store and where
        they appear, browser-side metadata stripping (including GPS
        location), that photos are published as submitted and removed when
        we become aware of a problem, and that account deletion includes
        uploaded files. We also corrected several details this policy
        previously under-described: the deletion section now says precisely
        what happens today (dogs and services soft-delete in the app;
        account removal is a manual process on request); Turnstile also
        runs on password-reset requests; new-message notification emails
        include a short message preview; and calendar busy blocks refresh
        on view rather than on a fixed timer.
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
