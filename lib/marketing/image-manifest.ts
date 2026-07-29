import type { StaticImageData } from "next/image";

import closingDusk from "@/public/marketing/closing-dusk.jpg";
import communityPet from "@/public/marketing/community-pet.jpg";
import communitySportBite from "@/public/marketing/community-sport-bite.jpg";
import communitySportJump from "@/public/marketing/community-sport-jump.jpg";
import heroField from "@/public/marketing/hero-field.jpg";
import transformation from "@/public/marketing/transformation.jpg";

/**
 * Single source of truth for every photographic slot on the marketing
 * homepage. Components render ONLY through this manifest, never with a
 * hardcoded path, so replacing interim stock with Shane's real field shots
 * is a file replacement (same filename in public/marketing/) plus a status
 * and source update here. No component edits.
 *
 * Static imports (not string paths) are deliberate: Next.js reads the real
 * dimensions at build time (correct aspect ratio after a swap, zero layout
 * shift) and generates blur placeholders automatically.
 *
 * Shot specs for the replacement photos live in docs/design/image-manifest.md.
 */

type ImageSlot = {
  image: StaticImageData;
  /** Truthful description. The truthful-copy contract extends to alt text. */
  alt: string;
  section: string;
  orientation: "landscape" | "portrait";
  subject: string;
  status: "interim-stock" | "final";
  source: {
    photographer: string;
    url: string;
    license: string;
  };
};

const UNSPLASH_LICENSE =
  "Unsplash License (free commercial use, no attribution required)";

export const MARKETING_IMAGES = {
  heroField: {
    image: heroField,
    alt: "A Belgian Malinois on a leash held by its handler, alert on a training field",
    section: "Hero (full-viewport opening scene)",
    orientation: "landscape",
    subject: "Working Malinois with handler, leash tension, field setting",
    status: "interim-stock",
    source: {
      photographer: "G-R Mottez",
      url: "https://unsplash.com/photos/oU9tVBNp-lU",
      license: UNSPLASH_LICENSE,
    },
  },
  transformation: {
    image: transformation,
    alt: "A German Shepherd sitting attentively in front of its handler, holding eye contact",
    section: "Section 1: the transformation (the right trainer, found)",
    orientation: "landscape",
    subject: "Dog in focused sit, eye contact with handler, quiet park",
    status: "interim-stock",
    source: {
      photographer: "John Tuesday",
      url: "https://unsplash.com/photos/5q7G1zwQvtY",
      license: UNSPLASH_LICENSE,
    },
  },
  communitySportBite: {
    image: communitySportBite,
    alt: "A dog driving into a bite rag held by a decoy during protection sport training",
    section: "Community strip: sport / protection work",
    orientation: "landscape",
    subject: "Bite development work with decoy, mid-action",
    status: "interim-stock",
    source: {
      photographer: "Anna Dudkova",
      url: "https://unsplash.com/photos/Vc5fACTq9-k",
      license: UNSPLASH_LICENSE,
    },
  },
  communitySportJump: {
    image: communitySportJump,
    alt: "A German Shepherd clearing a hurdle on an obedience course",
    section: "Community strip: sport / trial work",
    orientation: "landscape",
    subject: "Dog mid-jump over hurdle, trial-style obstacle",
    status: "interim-stock",
    source: {
      photographer: "Anna Dudkova",
      url: "https://unsplash.com/photos/SpO8gwe4JYs",
      license: UNSPLASH_LICENSE,
    },
  },
  communityPet: {
    image: communityPet,
    alt: "An owner kneeling at eye level with their dog in golden-hour light during training",
    section: "Community strip: everyday owner and pet dog",
    orientation: "landscape",
    subject: "Owner and pet dog, focused training moment, warm light",
    status: "interim-stock",
    source: {
      photographer: "Pinto Art",
      url: "https://unsplash.com/photos/4WsxPLCNr9U",
      license: UNSPLASH_LICENSE,
    },
  },
  closingDusk: {
    image: closingDusk,
    alt: "A handler and dog in silhouette, face to face at dusk",
    section: "Section 8: founding-trainer closing (dark scene)",
    orientation: "landscape",
    subject: "Handler and dog silhouette at dusk, face to face",
    status: "interim-stock",
    source: {
      photographer: "David Rangel",
      url: "https://unsplash.com/photos/kN4enV9R8XU",
      license: UNSPLASH_LICENSE,
    },
  },
} as const satisfies Record<string, ImageSlot>;

export type MarketingImageKey = keyof typeof MARKETING_IMAGES;
