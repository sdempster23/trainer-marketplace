import type { StaticImageData } from "next/image";

import uiCalendar from "@/public/marketing/ui/ui-calendar.png";
import uiDirectory from "@/public/marketing/ui/ui-directory.png";
import uiProfile from "@/public/marketing/ui/ui-profile.png";
import uiThread from "@/public/marketing/ui/ui-thread.png";

/**
 * Real product screenshots for the homepage's device frames.
 *
 * Truthful-imagery contract: these are ACTUAL screens captured from the
 * running app against local seed data (390x844 viewport at 2x), not
 * mockups. The message thread was created by driving the real owner and
 * trainer messaging flow; Sofia's services were added through the real
 * services form. To refresh after a UI change, recapture at the same
 * viewport and replace the file (same name), nothing else changes.
 */

type UiShot = {
  image: StaticImageData;
  alt: string;
  /** Caption shown beside the device frame in section 2. */
  title: string;
  caption: string;
  /** Where this screen lives in the app (for recapture). */
  route: string;
};

export const UI_SHOTS = {
  directory: {
    image: uiDirectory,
    alt: "PawMatch trainer directory showing trainer cards with specialties and travel radius",
    title: "The directory",
    caption:
      "Every trainer, searchable by location, specialty, and price. Family-dog help and sport-dog specialists side by side.",
    route: "/trainers",
  },
  profile: {
    image: uiProfile,
    alt: "A trainer profile on PawMatch with bio, specialties, and priced services",
    title: "The profile",
    caption:
      "Bio, specialties, and services with real prices. What you see is what you book.",
    route: "/trainers/[id]",
  },
  thread: {
    image: uiThread,
    alt: "A message conversation between an owner and a trainer on PawMatch",
    title: "The conversation",
    caption:
      "Talk before you book. Ask about your dog, your goals, your schedule.",
    route: "/messages/[threadId]",
  },
  calendar: {
    image: uiCalendar,
    alt: "A trainer's PawMatch account showing calendar connected with busy times syncing, and payment set up their own way",
    title: "Already yours",
    caption:
      "No new accounts, no new logins. Clients pay you the way they already do, and PawMatch syncs with the calendar you already run.",
    route: "/account",
  },
} as const satisfies Record<string, UiShot>;

export type UiShotKey = keyof typeof UI_SHOTS;
