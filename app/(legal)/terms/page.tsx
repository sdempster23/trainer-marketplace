/**
 * Terms of Service — self-drafted at the launch gate (arc ruling 7).
 * Deliberately truthful to the current product: off-platform payments, no
 * reviews, no vetting claims. CARRIED FLAGS (docs/resend-legal-arc.md,
 * pre-club-pitch list): lawyer review of the injury/assumption-of-risk
 * language, independent-contractor language, and arbitration/venue before
 * scale. An arbitration clause is deliberately ABSENT pending that review.
 */
export const metadata = {
  title: "Terms of Service — PawMatch",
  description: "The terms that govern your use of PawMatch.",
};

const EFFECTIVE_DATE = "August 10, 2026";

export default function TermsOfServicePage() {
  return (
    <article className="space-y-4 text-[15px] leading-7 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
      <h1>Terms of Service</h1>
      <p>Effective date: {EFFECTIVE_DATE}</p>
      <p>
        These terms govern your use of PawMatch (joinpawmatch.com), a
        marketplace that connects dog owners with professional dog trainers.
        By creating an account you agree to these terms and to our Privacy
        Policy.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be 18 or older to use PawMatch. By creating an account you
        confirm that you are at least 18 and able to enter into a binding
        agreement.
      </p>

      <h2>2. What PawMatch is (and is not)</h2>
      <p>
        PawMatch is a venue: we help owners find, message, and book
        independent trainers. PawMatch is not a training business and does
        not provide training services. Trainers on PawMatch are independent
        professionals — they are not our employees, agents, or partners, and
        we do not supervise their work. Credentials, certifications, and
        experience shown on a trainer&apos;s profile are provided by the
        trainer; we display them but do not independently verify them.
      </p>

      <h2>3. Payments happen off-platform</h2>
      <p>
        PawMatch does not process payments. Trainers set their own prices and
        collect payment directly from owners using their own methods (for
        example Venmo, PayPal, cash). Any payment dispute is between the
        owner and the trainer. Prices shown on PawMatch are the trainer&apos;s
        listed prices at the time of booking.
      </p>

      <h2>4. Your account</h2>
      <ul>
        <li>Provide accurate information and keep it current.</li>
        <li>Keep your password private; you are responsible for activity on
        your account.</li>
        <li>One account per person, for your own use.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law or ask another user to;</li>
        <li>harass, threaten, or deceive other users;</li>
        <li>post false listings, credentials, or booking requests;</li>
        <li>scrape, harvest, or bulk-download content or personal data;</li>
        <li>probe, bypass, or interfere with our security or rate limits;</li>
        <li>use PawMatch to advertise unrelated services.</li>
      </ul>
      <p>
        We may suspend or remove accounts that violate these terms.
      </p>

      <h2>6. Your content</h2>
      <p>
        You own what you post — profiles, photos, messages, listings. You
        grant PawMatch a non-exclusive license to host and display that
        content as needed to run the service (for example, showing a
        trainer&apos;s profile in search results). Don&apos;t post content
        you don&apos;t have the right to share.
      </p>

      <h2>7. Assumption of risk</h2>
      <p>
        <strong>
          Dog training involves inherent risk, including the risk of injury
          to people and animals. This is especially true of bite work,
          protection sports, and behavior-modification work. You participate
          in training arranged through PawMatch at your own risk. PawMatch
          does not control, supervise, or guarantee any trainer, owner, dog,
          training method, or training outcome, and is not responsible for
          injuries, damages, or losses arising from training sessions or
          from interactions between users.
        </strong>
      </p>

      <h2>8. Disclaimers and limitation of liability</h2>
      <p>
        <strong>
          PawMatch is provided &quot;as is&quot; and &quot;as
          available,&quot; without warranties of any kind, express or
          implied. To the maximum extent permitted by law, PawMatch and its
          operators are not liable for indirect, incidental, special,
          consequential, or punitive damages, or for any dispute, injury, or
          loss arising between users; and our total liability for any claim
          relating to the service is limited to one hundred US dollars
          ($100).
        </strong>
      </p>

      <h2>9. Termination</h2>
      <p>
        You can stop using PawMatch at any time and request account deletion
        (see the Privacy Policy). We may suspend or terminate accounts that
        violate these terms or put other users at risk.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Tennessee,
        without regard to conflict-of-law rules. Disputes will be resolved in
        the state or federal courts located in Tennessee.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms as the product evolves. The effective date
        above always reflects the current version; material changes will be
        noted on this page, and continued use after a change means you accept
        the updated terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms: hello@joinpawmatch.com. Privacy matters:
        privacy@joinpawmatch.com.
      </p>
    </article>
  );
}
