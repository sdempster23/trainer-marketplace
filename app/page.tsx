import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * PawMatch landing page — the front door a STRANGER meets.
 *
 * TRUTHFUL-COPY CONTRACT (standing — every claim on this page MUST be true
 * TODAY; do not add a claim until the feature ships):
 *   CLAIMABLE (built + live): search trainers by location, specialty, and
 *     price; the working/sport-dog niche (PSA, Schutzhund, French Ring,
 *     PPD); message a trainer; request a booking that the trainer confirms;
 *     two-way calendar sync (bookings → your calendar, your calendar →
 *     blocked slots); the trainer sets how they take payment (off-platform).
 *   NOT CLAIMABLE until built: reviews / ratings / "verified" trainers
 *     (Phase 10); in-app or "secure" payment / Stripe / payouts (Phase 8 —
 *     payments are OFF-PLATFORM); ANY social proof or volume ("trusted by
 *     N trainers", "thousands of sessions") — there are no real trainers
 *     yet, which is the whole point of this launch.
 *
 * Fully static — no auth, no per-user data, no DB reads.
 */
export const metadata = {
  title: "PawMatch — find a professional dog trainer",
  description:
    "Find a professional dog trainer by location, specialty, and price — including working and sport-dog specialists. Message, book, and keep it in the calendar you already use.",
};

export default function Home() {
  return (
    <main className="bg-background min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">PawMatch</span>
        <nav className="flex items-center gap-2 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </nav>
      </header>

      {/* Owner hero — the default visitor is a dog owner. */}
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 pt-16 pb-20 text-center sm:pt-24">
        <h1 className="text-foreground text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          Find a dog trainer who fits your dog.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-balance">
          Search professional trainers by location, specialty, and price —
          from everyday obedience to working and sport-dog work (PSA,
          Schutzhund, French Ring, protection). Message, request a session,
          and coordinate without leaving the tools you already use.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/trainers">Find a trainer</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </div>
      </section>

      {/* How it works — three truthful, built capabilities. */}
      <section className="border-border bg-muted/40 border-y">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
          <FeatureBlock
            title="Search by what matters"
            body="Filter by location, specialty, and price. Working and sport-dog specialties are first-class, not an afterthought."
          />
          <FeatureBlock
            title="Message and book"
            body="Start a conversation before you commit. Request a time; the trainer confirms it. Nothing is charged on PawMatch — you arrange payment directly."
          />
          <FeatureBlock
            title="Stays in your calendar"
            body="Your booked sessions sync to Google, Apple, or Outlook. Trainers can connect their own calendar so PawMatch never offers a time they're already busy."
          />
        </div>
      </section>

      {/* Trainer panel — the pitch, verbatim. */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-8 text-center sm:p-12">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Are you a trainer?
          </h2>
          <p className="text-muted-foreground text-lg text-balance">
            We send you clients that fit into the tools you&apos;re already
            using. Your PawMatch bookings land in your calendar, and your real
            schedule blocks the times you&apos;re not available — no
            double-books, no new app to babysit.
          </p>
          <p className="text-foreground text-balance font-medium">
            Free for founding trainers.
          </p>
          <div className="flex justify-center pt-2">
            <Button asChild size="lg">
              <Link href="/sign-up">Join as a trainer</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-border text-muted-foreground border-t px-6 py-8 text-center text-sm">
        PawMatch — dog owners and professional trainers.
      </footer>
    </main>
  );
}

function FeatureBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm">{body}</p>
    </div>
  );
}
