"use client";

import { useEffect, useRef } from "react";

/**
 * Mount-only scroll to the conversation's end. Rendered AFTER the sticky
 * composer dock (review catch: a sentinel above the dock aligns the newest
 * messages with the viewport bottom, where the pinned dock then covers
 * them — below the dock, "end" leaves the dock at its natural position
 * with the conversation clear above it). The ref guard survives the 30s
 * router.refresh() ticks — client state is preserved across RSC merges —
 * so the user's scroll position is never stomped.
 */
export function ScrollToLatest() {
  const ref = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);

  useEffect(() => {
    if (didScroll.current) return;
    didScroll.current = true;
    ref.current?.scrollIntoView({ block: "end" });
  }, []);

  return <div ref={ref} aria-hidden />;
}
