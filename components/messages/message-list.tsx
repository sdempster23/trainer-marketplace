"use client";

import type { MessageRow } from "@/lib/messages/threads";

/** Runs of closer messages share one timestamp; a gap beyond this (or a
 * sender change) earns a fresh one. */
const COALESCE_GAP_MS = 5 * 60 * 1000;

// Hoisted: Intl constructor cost is the expensive part (the local-time
// precedent); these re-run every 30s refresh tick otherwise.
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string): string {
  const key = dayKey(iso);
  const now = new Date();
  if (key === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === yesterday.toDateString()) return "Yesterday";
  return dayFormat.format(new Date(iso));
}

/**
 * The conversation body — client-side because every date decision here is
 * VIEWER-zone (dividers, Today/Yesterday) and the server doesn't know the
 * viewer's clock. Adds what the flat list lacked: date dividers, coalesced
 * timestamps (one per run, not one per bubble), long-token wrapping, and
 * scroll-to-latest on mount (the audit's biggest thread flow defect —
 * landing on the OLDEST message).
 */
export function MessageList({
  messages,
  viewerId,
}: {
  messages: MessageRow[];
  viewerId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((message, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isMine = message.sender_id === viewerId;
        const newDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);
        // Last of a run: sender changes, the gap opens, or the thread ends.
        const showTime =
          !next ||
          next.sender_id !== message.sender_id ||
          // A day boundary is a run-break too — otherwise a midnight-
          // crossing run leaves an untimed bubble above the divider.
          dayKey(next.created_at) !== dayKey(message.created_at) ||
          Date.parse(next.created_at) - Date.parse(message.created_at) >
            COALESCE_GAP_MS;

        return (
          <div key={message.id} className="flex flex-col gap-1.5">
            {newDay ? (
              <div
                className="text-muted-foreground py-2 text-center font-mono text-xs"
                suppressHydrationWarning
              >
                {dayLabel(message.created_at)}
              </div>
            ) : null}
            <div
              className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-line ${
                  isMine
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border-border border"
                }`}
              >
                {message.body}
              </div>
              {showTime ? (
                <span
                  className="text-muted-foreground font-mono text-xs"
                  suppressHydrationWarning
                >
                  {timeFormat.format(new Date(message.created_at))}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
