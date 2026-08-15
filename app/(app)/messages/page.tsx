import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { LocalTime } from "@/components/messages/local-time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getThreads } from "@/lib/messages/threads";
import { createClient } from "@/lib/supabase/server";
import { truncatePreview } from "@/lib/utils";

export const metadata = { title: "Messages — PawMatch" };

/** List-preview cap (code points — truncatePreview never splits an emoji). */
const PREVIEW_LENGTH = 90;

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
          <p role="alert" className="text-destructive text-sm">
            Your messages couldn&apos;t be loaded. Please refresh to try again.
          </p>
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
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Messages">
            Your conversations, most recent first.
        </PageHeader>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            Your messages couldn&apos;t be loaded. Please refresh to try again.
          </p>
        ) : threads.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {isOwner ? (
              <>
                No conversations yet — message a trainer from their profile in{" "}
                <Link href="/trainers" className="underline">
                  the directory
                </Link>
                , or from a booking.
              </>
            ) : isTrainer ? (
              <>No conversations yet — owners can message you from your listing or a booking.</>
            ) : (
              <>No conversations yet.</>
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {threads.map((thread) => (
              <Link key={thread.id} href={`/messages/${thread.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="flex flex-col gap-1 pt-6">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={
                          thread.isUnread ? "font-semibold" : "font-medium"
                        }
                      >
                        {thread.counterpartyName ?? counterpartyFallback}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        <LocalTime iso={thread.updatedAt} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground truncate text-sm">
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

        <div className="flex flex-col gap-2">
          {bookingsHref ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={bookingsHref}>Your bookings</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <Link href="/account">Back to account</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
