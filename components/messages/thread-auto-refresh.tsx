"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { markThreadRead } from "@/app/(messages)/actions";

/** Ruling 2's number: the open-thread refresh cadence. Realtime is
 * explicitly deferred — this is the honest server-rendered story. */
const REFRESH_INTERVAL_MS = 30_000;

/** Best-effort watermark write: a failed action FETCH (network drop, laptop
 * lid) rejects client-side before the action's own try/catch can swallow it
 * — catch here or every tick becomes an unhandled rejection. The next
 * visible tick retries. */
const markRead = (threadId: string) => {
  markThreadRead(threadId).catch(() => {});
};

/**
 * Mounted ONLY on the open thread page (the list refreshes by navigation).
 * On mount, IF THE TAB IS VISIBLE: mark the thread read (the watermark
 * write — M9 semantics, my column only). A background-tab open (cmd+click)
 * must NOT mark read — the user never saw the messages, and a false
 * watermark would also suppress the gated email; the visibilitychange
 * handler catches up the moment the tab is actually viewed. Every 30s
 * while visible: mark read again and router.refresh() to pull newer
 * messages. Renders nothing.
 */
export function ThreadAutoRefresh({ threadId }: { threadId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!document.hidden) {
      markRead(threadId);
    }

    const tick = () => {
      if (document.hidden) {
        return;
      }
      markRead(threadId);
      router.refresh();
    };
    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [threadId, router]);

  return null;
}
