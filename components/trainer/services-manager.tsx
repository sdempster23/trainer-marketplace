"use client";

import { useState } from "react";

import { createService } from "@/app/(trainer)/actions";
import { ServiceForm } from "@/components/trainer/service-form";
import { ServiceRow } from "@/components/trainer/service-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActiveService } from "@/lib/trainer/services";

/**
 * The lifted editing state the save-swap ruling needs: while any row is
 * editing, its Save carries the view's amber and the create form demotes
 * to graphite — one amber at all times, whichever form is the moment's
 * primary. Opening one editor closes any other (two open editors were
 * the investigation's "indistinguishable from the Add card" flag).
 */
export function ServicesManager({ services }: { services: ActiveService[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      {services.length > 0 ? (
        <div className="flex flex-col gap-4">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              isEditing={editingId === service.id}
              onEdit={() => setEditingId(service.id)}
              onClose={() => setEditingId(null)}
            />
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add a service</CardTitle>
          <CardDescription>
            Name it the way an owner would look for it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceForm
            action={createService}
            submitLabel="Add service"
            submitVariant={editingId !== null ? "default" : "action"}
          />
        </CardContent>
      </Card>
    </>
  );
}
