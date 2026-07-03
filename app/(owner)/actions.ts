"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { dogIdSchema, dogSchema } from "@/lib/validators/dog";

/**
 * Owner Server Actions — the owner-side twin of (trainer)/actions.ts, same
 * trusted-boundary discipline throughout: zod parse → auth → role check →
 * writes scoped to the caller + active rows → row-count rule → serializable
 * state with the { success } sentinel.
 */

export type DogActionState = { error: string } | { success: true } | null;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check the form and try again.";

/**
 * Shared prelude: authenticated caller with an OWNER profile, or the
 * appropriate exit (redirect for no session, { error } for wrong role).
 * Mirror of requireTrainer — role isn't in the JWT, so it's read from
 * profiles.
 */
async function requireOwner(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { error: string }
> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "owner") {
    return { error: "Only dog-owner accounts can manage dogs." };
  }
  return { supabase, userId };
}

const parseDogForm = (formData: FormData) =>
  dogSchema.safeParse({
    name: formData.get("name"),
    breed: formData.get("breed") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    temperamentNotes: formData.get("temperamentNotes") ?? "",
  });

export async function createDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsed = parseDogForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // No precursor-row guard needed (unlike createService's onboarding gate):
  // dogs attach directly to the profiles row, which signup's trigger minted.
  let writeError: string | null = null;
  try {
    const { error } = await ctx.supabase.from("dogs").insert({
      owner_id: ctx.userId,
      name: parsed.data.name,
      breed: parsed.data.breed,
      date_of_birth: parsed.data.dateOfBirth,
      temperament_notes: parsed.data.temperamentNotes,
    });
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsedId = dogIdSchema.safeParse(formData.get("dogId"));
  const parsed = parseDogForm(formData);
  if (!parsedId.success || !parsed.success) {
    return {
      error:
        parsedId.error?.issues[0]?.message ??
        parsed.error?.issues[0]?.message ??
        VALIDATION_ERROR,
    };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // .eq(owner_id) is belt-and-suspenders with RLS; the ROW-COUNT check is the
  // load-bearing part (cross-owner and nonexistent-id UPDATEs are silent
  // 0-row no-ops under RLS). .is(deleted_at, null): the view-spec rule
  // applies to writes — a soft-deleted id from a stale form is "not found".
  let updated: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("dogs")
      .update({
        name: parsed.data.name,
        breed: parsed.data.breed,
        date_of_birth: parsed.data.dateOfBirth,
        temperament_notes: parsed.data.temperamentNotes,
      })
      .eq("id", parsedId.data)
      .eq("owner_id", ctx.userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    updated = data;
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }
  if (!updated) {
    return { error: "That dog could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsedId = dogIdSchema.safeParse(formData.get("dogId"));
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // SOFT delete — dogs has no DELETE grant (M7: soft-delete tables keep
  // authenticated at SELECT/INSERT/UPDATE), and booking history FKs dogs
  // with ON DELETE RESTRICT anyway. Same row-count + active-only rules as
  // updateDog.
  let deleted: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("dogs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsedId.data)
      .eq("owner_id", ctx.userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    deleted = data;
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }
  if (!deleted) {
    return { error: "That dog could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
