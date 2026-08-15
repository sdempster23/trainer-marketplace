import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/states";
import { ComposeForm } from "@/components/messages/compose-form";
import { LocalTime } from "@/components/messages/local-time";
import { ThreadAutoRefresh } from "@/components/messages/thread-auto-refresh";
import { Button } from "@/components/ui/button";
import { getThread } from "@/lib/messages/threads";
import { createClient } from "@/lib/supabase/server";
import { dbIdSchema } from "@/lib/validators/id";

export const metadata = { title: "Conversation — PawMatch" };

const threadIdSchema = dbIdSchema();

/**
 * One conversation. RLS is the FLOOR (a non-participant's read returns no
 * row), but the route owns its view spec: junk ids 404 before any query,
 * and an invisible thread renders notFound — never an empty shell that
 * implies the thread exists.
 *
 * Read-state: ThreadAutoRefresh marks the thread read on mount and every
 * 30s while visible (the M9 watermark — my column only), and pulls new
 * messages via router.refresh() on the same tick (ruling 2's cadence;
 * realtime explicitly deferred).
 */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  if (!threadIdSchema.safeParse(threadId).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { thread, error } = await getThread(supabase, claims.sub, threadId);
  if (error) {
    return (
      <main className="bg-muted flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <p role="alert" className="text-destructive text-sm">
            This conversation couldn&apos;t be loaded. Please refresh to try
            again.
          </p>
        </div>
      </main>
    );
  }
  if (!thread) {
    notFound();
  }

  const counterparty =
    thread.counterpartyName ?? (thread.isOwnerSide ? "A trainer" : "An owner");

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <ThreadAutoRefresh threadId={thread.id} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{counterparty}</h1>
          {thread.bookingId ? (
            <p className="text-muted-foreground text-xs">
              Linked to a booking —{" "}
              <Link
                href={thread.isOwnerSide ? "/owner/bookings" : "/trainer/bookings"}
                className="underline"
              >
                view your bookings
              </Link>
            </p>
          ) : null}
        </header>

        <div className="flex flex-col gap-3">
          {thread.messages.length === 0 ? (
            /* Copy kept VERBATIM per the gate (the on-voice keeper). */
            <EmptyState>
              Say hello — where to meet, what to bring, what you&apos;re
              looking for.
            </EmptyState>
          ) : (
            thread.messages.map((message) => {
              const isMine = message.sender_id === claims.sub;
              return (
                <div
                  key={message.id}
                  className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                      isMine
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border-border border"
                    }`}
                  >
                    {message.body}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    <LocalTime iso={message.created_at} />
                  </span>
                </div>
              );
            })
          )}
        </div>

        <ComposeForm threadId={thread.id} />

        <Button asChild variant="outline" className="w-full">
          <Link href="/messages">All messages</Link>
        </Button>
      </div>
    </main>
  );
}
