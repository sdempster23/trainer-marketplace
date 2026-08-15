import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { ComposeForm } from "@/components/messages/compose-form";
import { MessageList } from "@/components/messages/message-list";
import { ScrollToLatest } from "@/components/messages/scroll-to-latest";
import { ThreadAutoRefresh } from "@/components/messages/thread-auto-refresh";
import { geistMono } from "@/lib/fonts";
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
          <ErrorState>
            This conversation couldn&apos;t be loaded. Please refresh to try
            again.
          </ErrorState>
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
    <main
      className={`bg-muted flex flex-1 flex-col px-6 pt-8 pb-0 ${geistMono.variable}`}
    >
      <ThreadAutoRefresh threadId={thread.id} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <header className="flex flex-col gap-1">
          <Link
            href="/messages"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← All messages
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {counterparty}
          </h1>
          <p className="text-muted-foreground text-xs">
            {thread.isOwnerSide ? "Trainer" : "Dog owner"}
            {thread.isOwnerSide ? (
              <>
                {" · "}
                <Link
                  href={`/trainers/${thread.counterpartyId}`}
                  className="underline"
                >
                  View profile
                </Link>
              </>
            ) : null}
            {thread.bookingId ? (
              <>
                {" · "}
                <Link
                  href={
                    thread.isOwnerSide ? "/owner/bookings" : "/trainer/bookings"
                  }
                  className="underline"
                >
                  Linked to a booking
                </Link>
              </>
            ) : null}
          </p>
        </header>

        <div className="flex-1 pb-4">
          {thread.messages.length === 0 ? (
            /* Copy kept VERBATIM per the gate (the on-voice keeper). */
            <EmptyState>
              Say hello — where to meet, what to bring, what you&apos;re
              looking for.
            </EmptyState>
          ) : (
            <MessageList messages={thread.messages} viewerId={claims.sub} />
          )}
        </div>

      </div>

      {/* The composer DOCK: sticky-in-flow, a direct child of main so
          -mx-6 reaches the real viewport edges (the Book-bar structure).
          No vh anywhere (watch item c) — the shell column is dvh-based.
          Keyboard honesty: AT FOCUS TIME the browser scrolls the textarea
          above the mobile keyboard; scrolling the thread with the keyboard
          open can leave the dock behind it until refocus (sticky is
          layout-viewport-anchored) — a visualViewport listener is the
          future fix if that gap ever matters. */}
      <div className="bg-background/95 border-border sticky bottom-0 -mx-6 border-t px-6 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl">
          <ComposeForm threadId={thread.id} />
        </div>
      </div>
      <ScrollToLatest />
    </main>
  );
}
