"use client";

import { useActionState, useEffect, useRef } from "react";

import type { ServiceActionState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_DURATION_MAX_MINUTES,
  SERVICE_DURATION_MIN_MINUTES,
  SERVICE_NAME_MAX_LENGTH,
  SESSION_TYPE_LABELS,
  SESSION_TYPES,
  type SessionType,
} from "@/lib/validators/trainer";

export type ServiceFormInitial = {
  name: string;
  description: string;
  priceDollars: string;
  durationMinutes: number;
  sessionType: SessionType;
};

/**
 * ONE form for both create and edit — identical fields, so it's built once:
 * the server action arrives as a prop, edit mode adds the hidden serviceId +
 * prefilled values + a Cancel affordance. On success, create mode resets for
 * the next add; edit mode closes via onSuccess (the { success } sentinel is a
 * fresh object per completed submit, so the effect fires every save).
 */
export function ServiceForm({
  submitVariant = "action",
  action,
  submitLabel,
  serviceId,
  initial,
  onSuccess,
  onCancel,
}: {
  /** The ruled save-swap: while a row edits, the create form demotes to
   * default and the row's Save carries the view's amber. */
  submitVariant?: "action" | "default";
  action: (
    prev: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
  submitLabel: string;
  serviceId?: string;
  initial?: ServiceFormInitial;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<
    ServiceActionState,
    FormData
  >(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {serviceId ? (
        <input type="hidden" name="serviceId" value={serviceId} />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={`name-${serviceId ?? "new"}`}>Service name</Label>
        <Input
          id={`name-${serviceId ?? "new"}`}
          name="name"
          required
          maxLength={SERVICE_NAME_MAX_LENGTH}
          placeholder="Private obedience session"
          defaultValue={initial?.name}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`description-${serviceId ?? "new"}`}>
          Description <span className="text-muted-foreground font-normal">· optional</span>
        </Label>
        <Textarea
          id={`description-${serviceId ?? "new"}`}
          name="description"
          rows={2}
          maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
          placeholder="What the session covers and who it's for."
          defaultValue={initial?.description}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`price-${serviceId ?? "new"}`}>Price (USD)</Label>
          <Input
            id={`price-${serviceId ?? "new"}`}
            name="priceDollars"
            inputMode="decimal"
            required
            placeholder="85 or 62.50"
            defaultValue={initial?.priceDollars}
          />
        </div>

        {/* Number input over a select: the DB honors any 15-480 minutes and a
            select can't offer that range honestly; min/max/step=15 nudges
            toward quarter-hour sessions while zod + the CHECK stay the law. */}
        <div className="grid gap-2">
          <Label htmlFor={`duration-${serviceId ?? "new"}`}>Minutes</Label>
          <Input
            id={`duration-${serviceId ?? "new"}`}
            name="durationMinutes"
            type="number"
            required
            min={SERVICE_DURATION_MIN_MINUTES}
            max={SERVICE_DURATION_MAX_MINUTES}
            step={15}
            placeholder="60"
            defaultValue={initial?.durationMinutes}
          />
          <p className="text-muted-foreground text-xs">15 min – 8 hours.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`type-${serviceId ?? "new"}`}>Where</Label>
          <NativeSelect
            id={`type-${serviceId ?? "new"}`}
            name="sessionType"
            required
            defaultValue={initial?.sessionType ?? ""}
          >
            <option value="" disabled>
              Choose where
            </option>
            {SESSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SESSION_TYPE_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant={submitVariant} disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
