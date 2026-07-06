import { truncatePreview } from "@/lib/utils";
import { formatBookingStart } from "@/lib/validators/booking";
import {
  formatPrice,
  TIMEZONE_LABELS,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

/**
 * Transition-email templates — five pure functions, plain text v1.
 *
 * Times render in the TRAINER'S zone with the zone stated, in EVERY email —
 * resolved by data reality, not preference: owners have no timezone anywhere
 * in the schema, so owner-received mail cannot be owner-local (owner-tz
 * collection is a horizon item). Consistent with every surface.
 *
 * Deep links come from NEXT_PUBLIC_SITE_URL (the Phase-0 env var — already
 * required per environment).
 */

export type BookingMailContext = {
  /** The OTHER party's display name — NULL falls back per direction. */
  counterpartyName: string | null;
  dogName: string;
  serviceName: string;
  startsAtIso: string;
  trainerTimezone: string;
  priceCents: number;
};

export type RenderedMail = { subject: string; text: string };

const zoneLabel = (tz: string) =>
  TIMEZONE_LABELS[tz as TrainerTimezone] ?? tz;

const when = (c: BookingMailContext) =>
  `${formatBookingStart(c.startsAtIso, c.trainerTimezone)} (${zoneLabel(c.trainerTimezone)})`;

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** → the TRAINER: a new PENDING request landed. */
export function requestReceived(c: BookingMailContext): RenderedMail {
  const owner = c.counterpartyName ?? "A dog owner";
  return {
    subject: `New booking request — ${c.serviceName}, ${when(c)}`,
    text: `${owner} requested ${c.serviceName} for ${c.dogName}.

When: ${when(c)}
Price: ${formatPrice(c.priceCents)}

Confirm or decline: ${siteUrl()}/trainer/bookings`,
  };
}

/** → the OWNER: the trainer confirmed. */
export function confirmed(c: BookingMailContext): RenderedMail {
  const trainer = c.counterpartyName ?? "Your trainer";
  return {
    subject: `Confirmed — ${c.serviceName}, ${when(c)}`,
    text: `${trainer} confirmed your ${c.serviceName} for ${c.dogName}.

When: ${when(c)}
Price: ${formatPrice(c.priceCents)}

Your bookings: ${siteUrl()}/owner/bookings`,
  };
}

/** → the OWNER: the trainer declined/cancelled (one template — the
 * decline/cancel split is presentational in the app too). Copy reviewed for
 * BOTH cases: it speaks to the outcome ("can't make it"), not the prior
 * status, and "nothing was charged" is universally true pre-Phase-8. */
export function declinedByTrainer(c: BookingMailContext): RenderedMail {
  const trainer = c.counterpartyName ?? "Your trainer";
  return {
    subject: `Cancelled — ${c.serviceName}, ${when(c)}`,
    text: `${trainer} can't make ${c.serviceName} for ${c.dogName} on ${when(c)}.

Nothing was charged. Find another time or trainer: ${siteUrl()}/trainers`,
  };
}

/** → the TRAINER: the owner cancelled. */
export function cancelledByOwner(c: BookingMailContext): RenderedMail {
  const owner = c.counterpartyName ?? "A dog owner";
  return {
    subject: `Cancelled by the owner — ${c.serviceName}, ${when(c)}`,
    text: `${owner} cancelled ${c.serviceName} for ${c.dogName}.

The slot is open again: ${when(c)}

Your bookings: ${siteUrl()}/trainer/bookings`,
  };
}

/** Preview cap for newMessage (code points — truncatePreview never splits
 * an emoji) — the email is a doorbell, not the conversation; the full text
 * lives behind the /messages link. */
export const MESSAGE_PREVIEW_LENGTH = 160;

export type NewMessageMailContext = {
  /** The SENDER's display name — direction-agnostic (either party sends),
   * so the fallback can't name a role the way the booking templates do. */
  senderName: string | null;
  body: string;
};

/** → the OTHER PARTY: a new message landed while they were fully caught up
 * (the watermark gate lives in the action; this only renders). */
export function newMessage(c: NewMessageMailContext): RenderedMail {
  const sender = c.senderName ?? "Someone on PawMatch";
  const preview = truncatePreview(c.body, MESSAGE_PREVIEW_LENGTH);
  return {
    subject: `New message from ${sender}`,
    text: `${sender} sent you a message:

"${preview}"

Read and reply: ${siteUrl()}/messages`,
  };
}

/** → the OWNER: session marked complete (the future review-prompt hook). */
export function completed(c: BookingMailContext): RenderedMail {
  const trainer = c.counterpartyName ?? "Your trainer";
  return {
    subject: `Session complete — ${c.serviceName}`,
    text: `${trainer} marked your ${c.serviceName} with ${c.dogName} complete.

When: ${when(c)}
Price: ${formatPrice(c.priceCents)}

Your bookings: ${siteUrl()}/owner/bookings`,
  };
}
