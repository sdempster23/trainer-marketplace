"use client";

import { useActionState, useState } from "react";

import { deleteService, updateService } from "@/app/(trainer)/actions";
import type { ServiceActionState } from "@/app/(trainer)/actions";
import { ServiceForm } from "@/components/trainer/service-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ActiveService } from "@/lib/trainer/services";
import {
  centsToDollarsInput,
  formatPrice,
  SESSION_TYPE_LABELS,
} from "@/lib/validators/trainer";

/**
 * One service on the management page: display row with Edit + Delete.
 * Edit swaps the row for the shared ServiceForm prefilled (pure client
 * state, no routing); Cancel or a successful save restores the display,
 * which revalidation has refreshed by then.
 */
export function ServiceRow({
  service,
  isEditing,
  onEdit,
  onClose,
}: {
  service: ActiveService;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ServiceForm
            action={updateService}
            submitLabel="Save changes"
            serviceId={service.id}
            initial={{
              name: service.name,
              description: service.description ?? "",
              priceDollars: centsToDollarsInput(service.price_cents),
              durationMinutes: service.duration_minutes,
              sessionType: service.session_type,
            }}
            submitVariant="action"
            onSuccess={onClose}
            onCancel={onClose}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{service.name}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {formatPrice(service.price_cents)} · {service.duration_minutes}{" "}
              min · {SESSION_TYPE_LABELS[service.session_type]}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <DeleteServiceButton serviceId={service.id} />
          </div>
        </div>
        {service.description ? (
          <p className="text-muted-foreground text-sm">{service.description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Two-step confirm, no native confirm() dialog: first click arms the delete
 * (button swaps to Confirm/Keep), so a stray click never destroys anything
 * and nothing blocks the event loop. The delete is SOFT (the action sets
 * deleted_at) — the row vanishes from every active-services read.
 */
function DeleteServiceButton({ serviceId }: { serviceId: string }) {
  const [isArmed, setIsArmed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    ServiceActionState,
    FormData
  >(deleteService, null);

  if (!isArmed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsArmed(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    // Grow DOWN, capped — the message-button rule (the sideways error span
    // was this page's card-breaker at 390).
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="serviceId" value={serviceId} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
          {isPending ? "Deleting…" : "Confirm delete"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsArmed(false)}
        >
          Keep
        </Button>
      </div>
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
