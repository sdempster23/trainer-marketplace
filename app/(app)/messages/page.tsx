import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { LocalTime } from "@/components/messages/local-time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { geistMono } from "@/lib/fonts";
import { getThreads } from "@/lib/messages/threads";
import { createClient } from "@/lib/supabase/server";
import { truncatePreview } from "@/lib/utils";

export const metadata = { title: "Messages — PawMatch" };

/** List-preview cap (code points — truncatePreview never splits an emoji). */
const PREVIEW_LENGTH = 90;

/** One failure voice for this surface (was duplicated inline twice). */
const LOAD_ERROR = "Your messages couldn't be loaded. Please refresh to try again.";

/**
 * The thread list — SHARED across roles (ruling 4): both sides see the same
 * shape, ordered by last activity (updated_at, bumped by message arrival —
 * M8 §7 — and deliberately never by mark-as-read). The one role-varying
 * pixel is the counterparty FALLBACK: post-M13 a trainer should never
 * actually see it (thread counterparties are policy-visible), but it stays
 * as defense — display_name is nullable and policies can regress.
 *
 * Refresh story (ruling 2): this page refreshes by NAVIGATION only; the
 * 30s interval lives on the open thread.
 */
export default async function MessagesPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  // A query error is NOT a missing profile — surface it (the same alert
  // shape the thread list uses) instead of silently bouncing a valid user.
  if (profileError) {
    return (
      <main className="bg-muted flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <ErrorState>{LOAD_ERROR}</ErrorState>
        </div>
      </main>
    );
  }
  if (!profile) {
    redirect("/account");
  }
  // Three roles exist; only owner/trainer can be thread PARTICIPANTS (the
  // M8 DEFINER gate + trainers FK), so an admin sees an honest empty state
  // with no role-forked links rather than trainer copy and a dead-end
  // /trainer/bookings redirect.
  const isOwner = profile.role === "owner";
  const isTrainer = profile.role === "trainer";
  const counterpartyFallback = isOwner ? "A trainer" : "An owner";
  const bookingsHref = isOwner
    ? "/owner/bookings"
    : isTrainer
      ? "/trainer/bookings"
      : null;

  const { threads, error } = await getThreads(supabase, claims.sub);

  return (
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Messages">
            Your conversations, most recent first.
        </PageHeader>

        {error ? (
          <ErrorState>{LOAD_ERROR}</ErrorState>
        ) : threads.length === 0 ? (
          // Zero states become the object (addition B); copy kept verbatim —
          // the investigation graded all three as on-voice.
          <EmptyState title="No conversations yet">
            {isOwner ? (
              <>
                Message a trainer from their profile in{" "}
                <Link href="/trainers" className="underline">
                  the directory
                </Link>
                , or from a booking.
              </>
            ) : isTrainer ? (
              <>Owners can message you from your listing or a booking.</>
            ) : (
              <>Admin accounts don&apos;t take part in conversations.</>
            )}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/messages/${thread.id}`}
                className="focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="flex flex-col gap-1 pt-6">
                    <div className="flex items-baseline justify-between gap-2">
                      {/* min-w-0 + truncate: a long display name must never
                          shove the row (390px audit finding). */}
                      <span
                        className={`min-w-0 truncate ${
                          thread.isUnread ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {thread.counterpartyName ?? counterpartyFallback}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        <LocalTime iso={thread.updatedAt} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {/* min-w-0 so truncate actually engages (flex items
                          default to min-width:auto). */}
                      <span className="text-muted-foreground min-w-0 truncate text-sm">
                        {thread.latestMessage
                          ? truncatePreview(thread.latestMessage.body, PREVIEW_LENGTH)
                          : "No messages yet"}
                      </span>
                      {thread.isUnread ? (
                        <Badge variant="strong" className="shrink-0">
                          New
                        </Badge>
                      ) : null}
                    </div>
                    {thread.bookingId ? (
                      <span className="text-muted-foreground text-xs">
                        Linked to a booking
                      </span>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* The shell's header now carries Account; the dead "Back to
            account" chain is gone. One lateral link remains. */}
        {bookingsHref ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={bookingsHref}>Your bookings</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
