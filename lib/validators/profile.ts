import { z } from "zod";

/**
 * Profile-domain validation — role-universal (owners AND trainers have a
 * profiles row). The display-name bounds used to live in validators/trainer
 * because trainer onboarding was the only writer; the /account "Your name"
 * section made the name role-universal, so the schema moved to neutral
 * ground rather than having account code import trainer validators.
 * validators/trainer composes displayNameSchema into onboardingSchema.
 */

/** Display-name bounds — the directory card's headline. Floor of 2 rejects
 * single-character noise; cap defends the unbounded `profiles.display_name`
 * text column (no DB CHECK), same discipline as the bio bounds. */
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 80;

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN_LENGTH, "Enter the name others should see.")
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `Keep your name under ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  );
