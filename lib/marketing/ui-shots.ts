import type { StaticImageData } from "next/image";

import cropCalendar from "@/public/marketing/ui/crops/crop-calendar.png";
import cropPayment from "@/public/marketing/ui/crops/crop-payment.png";
import cropSearch from "@/public/marketing/ui/crops/crop-search.png";
import cropThread from "@/public/marketing/ui/crops/crop-thread.png";
import searchDemoPoster from "@/public/marketing/ui/search-demo-poster.jpg";
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
} as const satisfies Record<string, UiShot>;

/**
 * Small proof crops for the feature sections (element screenshots from
 * the running app, same truthful-imagery provenance as UI_SHOTS).
 */
export const UI_CROPS = {
  search: {
    image: cropSearch,
    alt: "PawMatch search filters: ZIP code, radius, and specialty checkboxes from puppy to protection sport",
  },
  thread: {
    image: cropThread,
    alt: "An owner and trainer messaging about puppy training sessions",
  },
  calendar: {
    image: cropCalendar,
    alt: "A trainer's calendar card showing calendar connected with busy times blocking slots",
  },
  payment: {
    image: cropPayment,
    alt: "A trainer's payment card: clients pay directly, PawMatch never handles the money",
  },
} as const;

/**
 * Section 4's live demo: a REAL search recorded against the production
 * build (Playwright-driven: type ZIP 37203, check Puppy, search, open the
 * matching profile). VP8 WebM (no H.264 encoder available headlessly);
 * browsers without WebM support and prefers-reduced-motion users get the
 * poster frame. Re-record by re-running the flow at 1280x800.
 */
export const SEARCH_DEMO = {
  videoSrc: "/marketing/ui/search-demo.webm",
  poster: searchDemoPoster,
  alt: "Screen recording of a real PawMatch search: typing a ZIP code, choosing the puppy specialty, and opening the matching trainer profile",
} as const;

export type UiShotKey = keyof typeof UI_SHOTS;
