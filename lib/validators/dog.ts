import { z } from "zod";

/**
 * Dog-profile validation (owner domain). Derived from the live M2 DDL:
 * `name` is the only required user field; breed / date_of_birth /
 * temperament_notes are nullable; photo_url exists but has no upload flow
 * yet (deferred — placeholder strategy, same as avatars). The single DB
 * CHECK is date_of_birth <= CURRENT_DATE; everything else is uncapped text,
 * so zod supplies the caps (the bio/services discipline). No dog enums exist
 * — breed is deliberately free text (crosses and mixes don't enumerate).
 */

export const DOG_NAME_MIN_LENGTH = 1;
export const DOG_NAME_MAX_LENGTH = 60;
export const DOG_BREED_MAX_LENGTH = 60;
export const DOG_NOTES_MAX_LENGTH = 1000;

/** Today as an ISO date string — ISO dates compare correctly as strings, so
 * the future-birthdate refine below mirrors the DB CHECK
 * (date_of_birth <= CURRENT_DATE) without Date-object timezone edge cases. */
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Optional text fields normalize "" → null: the columns are nullable —
 * store the absence, not an empty string. */
const optionalTrimmed = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

export const dogSchema = z.object({
  name: z
    .string()
    .trim()
    .min(DOG_NAME_MIN_LENGTH, "Give your dog a name.")
    .max(
      DOG_NAME_MAX_LENGTH,
      `Keep the name under ${DOG_NAME_MAX_LENGTH} characters.`,
    ),
  breed: optionalTrimmed(
    DOG_BREED_MAX_LENGTH,
    `Keep the breed under ${DOG_BREED_MAX_LENGTH} characters.`,
  ),
  dateOfBirth: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      "Enter the birth date as YYYY-MM-DD.",
    )
    .refine(
      (v) => v === null || v <= todayISO(),
      "The birth date can't be in the future.",
    ),
  temperamentNotes: optionalTrimmed(
    DOG_NOTES_MAX_LENGTH,
    `Keep the notes under ${DOG_NOTES_MAX_LENGTH} characters.`,
  ),
});

export type DogInput = z.infer<typeof dogSchema>;

/** Update/delete target id — rides the form as a hidden field. Strict
 * z.uuid() is correct while all dogs are app-created v4s; a future
 * seeded-dog EDIT test would need the gate loosened (the z.guid() lesson:
 * a gate stricter than the column it guards is a correctness bug). */
export const dogIdSchema = z.uuid("Invalid dog.");
