"use client";

import { useActionState, useEffect, useState } from "react";

import { sendMessage, type MessageActionState } from "@/app/(messages)/actions";
import { Button } from "@/components/ui/button";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/validators/message";

/**
 * The composer — one textarea posting through sendMessage (the participant-
 * scoped insert; the watermark-gated email rides in the action's after()).
 * Errors render INLINE under the field, the transition-buttons pattern.
 *
 * The textarea is CONTROLLED, and that is load-bearing: React 19 resets
 * uncontrolled form fields after ANY form action completes — success or
 * error — so an uncontrolled field would eat the user's draft on a
 * transient failure. Controlled state survives the action; we clear it
 * only on confirmed success.
 */
export function ComposeForm({ threadId }: { threadId: string }) {
  const [state, formAction, isPending] = useActionState<
    MessageActionState,
    FormData
  >(sendMessage, null);
  const [body, setBody] = useState("");

  useEffect(() => {
    if (state && "success" in state) {
      setBody("");
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        required
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        className="border-input bg-background focus-visible:ring-ring w-full resize-y rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
      />
      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
