"use client";

import { useActionState, useEffect, useState } from "react";

import {
  disableFeed,
  rotateFeedToken,
} from "@/app/(trainer)/actions";
import type {
  FeedDisableState,
  FeedRotateState,
} from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** What the server component could learn about the feed row. "unknown" is a
 * FAILED read, not absence — the manager must not offer Generate (which is
 * the rotate RPC!) when it can't know whether a feed already exists. */
export type FeedStatus = "enabled" | "disabled" | "unknown";

/** The client's view of the feed, superseding server props once an action
 * completes in this mount (revalidation may lag a render; review finding:
 * stale rotate state must never outlive a newer disable). */
type FeedView = { kind: "fresh"; url: string } | { kind: "disabled" } | null;

/**
 * The /account "Calendar feed" manager (trainer fork only).
 *
 * State model (review-hardened): ONE view value, updated by effects in
 * completion order, so the LAST completed action always wins — generate→
 * disable shows disabled (never the dead URL), and each fresh URL arrives
 * with confirm collapsed and the copy button reset. The plaintext URL lives
 * only in this mount's action state (ruling 4): shown once, copy button,
 * "you won't see this again"; afterwards only row metadata renders.
 * Inline two-step confirms, never window.confirm (native dialogs block the
 * page and browser automation).
 */
export function CalendarFeedManager({
  status,
  createdAt,
  rotatedAt,
}: {
  status: FeedStatus;
  createdAt: string | null;
  rotatedAt: string | null;
}) {
  const [rotateState, rotateAction, isRotating] = useActionState<
    FeedRotateState,
    FormData
  >(rotateFeedToken, null);
  const [disableState, disableAction, isDisabling] = useActionState<
    FeedDisableState,
    FormData
  >(disableFeed, null);

  const [view, setView] = useState<FeedView>(null);
  const [lastAction, setLastAction] = useState<"rotate" | "disable" | null>(
    null,
  );
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!rotateState) return;
    setLastAction("rotate");
    if ("url" in rotateState) {
      setView({ kind: "fresh", url: rotateState.url });
      setConfirmingRotate(false); // disarm — no live Rotate button under a fresh URL
      setHasCopied(false); // this URL has NOT been copied, whatever the last one was
    }
  }, [rotateState]);

  useEffect(() => {
    if (!disableState) return;
    setLastAction("disable");
    if ("success" in disableState) {
      setView({ kind: "disabled" }); // supersedes any earlier fresh URL
      setConfirmingDisable(false);
    }
  }, [disableState]);

  const freshUrl = view?.kind === "fresh" ? view.url : null;
  const showAsEnabled =
    view !== null ? view.kind === "fresh" : status === "enabled";

  // Only the MOST RECENT action's error may render — a stale rotate error
  // must not sit next to a successful disable (review finding).
  const actionError =
    lastAction === "rotate" && rotateState && "error" in rotateState
      ? rotateState.error
      : lastAction === "disable" && disableState && "error" in disableState
        ? disableState.error
        : null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });

  // A failed status read: offering "Generate" here would run the rotate RPC
  // against a feed that may exist — bypassing the rotate warning entirely.
  // Degrade to read-only honesty instead (and the page already logged it).
  if (status === "unknown" && view === null) {
    return (
      <p className="text-muted-foreground text-sm" role="alert">
        Couldn&apos;t load your feed status — refresh to try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {freshUrl ? (
        <div className="flex flex-col gap-2" data-testid="feed-url-once">
          <p className="font-medium">Your calendar feed URL</p>
          <div className="flex gap-2">
            <Input readOnly value={freshUrl} aria-label="Calendar feed URL" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(freshUrl);
                setHasCopied(true);
              }}
            >
              {hasCopied ? "Copied ✓" : "Copy"}
            </Button>
          </div>
          <p className="text-muted-foreground">
            Copy it now — you won&apos;t see this URL again. Paste it into
            Google Calendar (&quot;From URL&quot;), Apple Calendar, or Outlook
            as a calendar subscription. New bookings can take up to a day to
            appear in Google Calendar.
          </p>
        </div>
      ) : showAsEnabled ? (
        <div className="grid gap-0.5">
          <span className="font-medium">Feed enabled ✓</span>
          <span className="text-muted-foreground">
            {createdAt ? `Created ${formatDate(createdAt)}` : null}
            {rotatedAt ? ` · URL rotated ${formatDate(rotatedAt)}` : null}
          </span>
          <span className="text-muted-foreground">
            The URL is only shown when generated. Lost it? Rotate to get a
            new one.
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Get your PawMatch bookings in Google, Apple, or Outlook calendar via
          a private subscription URL.
        </p>
      )}

      {actionError ? (
        <p className="text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {!showAsEnabled ? (
        <form action={rotateAction}>
          <Button type="submit" size="sm" variant="outline" disabled={isRotating}>
            {isRotating ? "Generating…" : "Generate feed URL"}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {confirmingRotate ? (
            <form action={rotateAction} className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Existing calendar subscriptions will stop working.
              </span>
              {/* Armed-confirm emphasis: transient, deliberate — the one
                  solid button in the card while the warning shows. */}
              <Button type="submit" size="sm" disabled={isRotating}>
                {isRotating ? "Rotating…" : "Rotate now"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmingRotate(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmingRotate(true);
                setConfirmingDisable(false);
              }}
            >
              Rotate URL…
            </Button>
          )}

          {confirmingDisable ? (
            <form action={disableAction} className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Subscribed calendars will stop updating.
              </span>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={isDisabling}
              >
                {isDisabling ? "Disabling…" : "Disable feed"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmingDisable(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmingDisable(true);
                setConfirmingRotate(false);
              }}
            >
              Disable…
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
