"use client";

import { useActionState, useEffect, useState } from "react";

import {
  removeExternalCalendar,
  setExternalCalendar,
} from "@/app/(trainer)/actions";
import type { ExternalCalendarState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { externalCalendarUrlSchema } from "@/lib/validators/feed";

/** Server-derived status. "unknown" is a FAILED read, not absence — never
 * offer paste-over against unknown state (the M15 lesson: paste is a
 * destructive replace when a subscription already exists). */
export type ExternalCalendarStatus = "subscribed" | "none" | "unknown";

/**
 * The /account "Your calendar" card (M16, import half) — sibling to the
 * M15 export card, trainer fork only.
 *
 * States:
 *  - none      → paste-URL input + Connect
 *  - subscribed→ "showing your calendar as of <lastFetched>" + block count;
 *                a >24h failing warning (ruling 6 copy verbatim); two-step
 *                Remove whose copy says slots will unblock
 *  - unknown   → read-only "couldn't load" (never the paste UI)
 * Fresh action success supersedes stale props for one render (revalidation
 * may lag), same last-action-wins discipline as the M15 card.
 */
export function ExternalCalendarManager({
  status,
  lastFetchedAt,
  failingSince,
  blockCount,
}: {
  status: ExternalCalendarStatus;
  lastFetchedAt: string | null;
  failingSince: string | null;
  // null = the count couldn't be read; the card omits the count line rather
  // than claiming "no busy times" (a false all-clear).
  blockCount: number | null;
}) {
  const [setState, setAction, isSetting] = useActionState<
    ExternalCalendarState,
    FormData
  >(setExternalCalendar, null);
  const [removeState, removeAction, isRemoving] = useActionState<
    ExternalCalendarState,
    FormData
  >(removeExternalCalendar, null);

  const [clientError, setClientError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [localOverride, setLocalOverride] = useState<
    "subscribed" | "none" | null
  >(null);
  const [lastAction, setLastAction] = useState<"set" | "remove" | null>(null);
  // A just-succeeded connect/replace clears the failing state client-side
  // (revalidation may lag one render) — suppress the stale >24h warning that
  // would otherwise flash red right after a successful reconnect.
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (!setState) return;
    setLastAction("set");
    if ("success" in setState) {
      setLocalOverride("subscribed");
      setJustReconnected(true);
    }
  }, [setState]);
  useEffect(() => {
    if (!removeState) return;
    setLastAction("remove");
    if ("success" in removeState) {
      setLocalOverride("none");
      setConfirmingRemove(false);
    }
  }, [removeState]);

  const effectiveStatus: ExternalCalendarStatus = localOverride ?? status;

  // Only the MOST RECENT action's error renders — a stale Replace error must
  // not mask a fresh, distinct Remove error (or vice versa).
  const actionError =
    lastAction === "set" && setState && "error" in setState
      ? setState.error
      : lastAction === "remove" && removeState && "error" in removeState
        ? removeState.error
        : null;

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const failingOver24h =
    failingSince !== null &&
    Date.now() - Date.parse(failingSince) > 24 * 60 * 60 * 1000;

  function handleSubmit(formData: FormData) {
    const parsed = externalCalendarUrlSchema.safeParse(formData.get("url"));
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the URL.");
      return; // never fires the action with a doomed value
    }
    setClientError(null);
    setAction(formData);
  }

  if (effectiveStatus === "unknown") {
    return (
      <p className="text-muted-foreground text-sm" role="alert">
        Couldn&apos;t load your calendar status — refresh to try again.
      </p>
    );
  }

  if (effectiveStatus === "none") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Paste your calendar&apos;s secret ICS URL and PawMatch will block
          the times you&apos;re already busy. In Google Calendar: Settings →
          your calendar → &quot;Secret address in iCal format.&quot;
        </p>
        <form action={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://calendar.google.com/…/basic.ics"
              aria-label="Calendar ICS URL"
            />
            <Button type="submit" size="sm" disabled={isSetting}>
              {isSetting ? "Connecting…" : "Connect"}
            </Button>
          </div>
          {clientError ? (
            <p className="text-destructive" role="alert">{clientError}</p>
          ) : null}
          {actionError ? (
            <p className="text-destructive" role="alert">{actionError}</p>
          ) : null}
        </form>
      </div>
    );
  }

  // subscribed
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-0.5">
        <span className="font-medium">Calendar connected ✓</span>
        <span className="text-muted-foreground">
          {lastFetchedAt
            ? `Showing your calendar as of ${formatWhen(lastFetchedAt)}.`
            : "Checking your calendar on your next booking-page view."}
        </span>
        {lastFetchedAt && blockCount !== null ? (
          <span className="text-muted-foreground">
            {blockCount === 0
              ? "No busy times in the next two weeks."
              : `${blockCount} busy ${blockCount === 1 ? "time" : "times"} blocking slots in the next two weeks.`}
          </span>
        ) : null}
      </div>

      {failingOver24h && !justReconnected ? (
        <p className="text-destructive" role="alert">
          We haven&apos;t been able to reach your calendar since{" "}
          {formatWhen(failingSince!)}. Your slots still reflect the last
          successful sync — check that the URL is still valid.
        </p>
      ) : null}

      {actionError ? (
        <p className="text-destructive" role="alert">{actionError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Re-paste to replace (e.g. after a Google secret reset). */}
        <form action={handleSubmit} className="flex items-center gap-2">
          <Input
            name="url"
            type="url"
            inputMode="url"
            placeholder="Paste a new URL to replace"
            aria-label="Replace calendar ICS URL"
            className="w-64"
          />
          <Button type="submit" size="sm" variant="outline" disabled={isSetting}>
            {isSetting ? "Replacing…" : "Replace"}
          </Button>
        </form>

        {confirmingRemove ? (
          <form action={removeAction} className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Your external busy times will stop blocking slots.
            </span>
            <Button type="submit" size="sm" variant="destructive" disabled={isRemoving}>
              {isRemoving ? "Removing…" : "Remove calendar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirmingRemove(true)}
          >
            Remove…
          </Button>
        )}
      </div>
      {clientError ? (
        <p className="text-destructive" role="alert">{clientError}</p>
      ) : null}
    </div>
  );
}
