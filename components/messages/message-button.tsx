"use client";

import { useActionState } from "react";

import {
  findOrCreateThread,
  type MessageActionState,
} from "@/app/(messages)/actions";
import { Button } from "@/components/ui/button";

/**
 * The universal messaging entry point — every "Message" button is
 * find-or-create (UNIQUE pair; the 23505 race is handled in the action) and
 * lands on /messages/[threadId] via the action's redirect. bookingId is the
 * optional context link: it only attaches if this click CREATES the thread
 * (immutable post-INSERT) and only if the booking belongs to the pair —
 * the action verifies-or-drops it.
 */
export function MessageButton({
  counterpartyId,
  bookingId,
}: {
  counterpartyId: string;
  bookingId?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    MessageActionState,
    FormData
  >(findOrCreateThread, null);
  // Error BELOW the button, width-capped: callers place this form inside
  // shrink-0 non-wrapping action rows — an inline error span beside the
  // button would widen the row and squash the card body. Growing DOWN is
  // safe; growing SIDEWAYS is not.
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="counterpartyId" value={counterpartyId} />
      {bookingId ? (
        <input type="hidden" name="bookingId" value={bookingId} />
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Opening…" : "Message"}
      </Button>
      {state && "error" in state ? (
        <span
          role="alert"
          className="text-destructive max-w-40 text-right text-xs break-words"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
