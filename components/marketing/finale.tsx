"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { Button } from "@/components/ui/button";
import { MARKETING_IMAGES } from "@/lib/marketing/image-manifest";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Section 8: the founding-trainer finale, the launch's actual ask. Dusk
 * photo carries the dark act to its close; the pitch is the old homepage's
 * trainer panel promoted to the closing scene, claims unchanged (all
 * shipped: calendar bridge both directions, no double-books, free today).
 *
 * Motion, and why: the photo settles from a slight zoom as the scene
 * enters (the last camera move, mirroring the hero's first) and the pitch
 * rises in once. Static under reduced motion.
 */
export function FinaleSection() {
  const ref = useRef<HTMLElement>(null);
  const { image, alt } = MARKETING_IMAGES.closingDusk;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".finale-media", {
          scale: 1.06,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "top top",
            scrub: true,
          },
        });
        gsap.from("[data-finale-line]", {
          y: 24,
          autoAlpha: 0,
          duration: 0.55,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: { trigger: ref.current, start: "top 55%", once: true },
        });
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="relative flex min-h-[100dvh] flex-col justify-end overflow-hidden"
    >
      <Image
        src={image}
        alt={alt}
        fill
        placeholder="blur"
        sizes="100vw"
        className="finale-media object-cover"
      />
      {/* Same worst-point AA floors as the hero scrim (the dusk photo is
          already dark; the floor guards against a brighter final swap). */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/90 via-black/70 via-40% to-transparent"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 pb-20 sm:px-10 sm:pb-28">
        <h2
          data-finale-line
          className="font-display max-w-3xl text-4xl leading-none font-bold tracking-[-0.035em] text-balance text-white sm:text-6xl lg:text-7xl"
        >
          Free for founding trainers.
        </h2>
        <p
          data-finale-line
          className="max-w-xl text-lg leading-relaxed text-balance text-white/90"
        >
          We send you clients that fit the tools you already use. Bookings
          land in your calendar, your real schedule blocks the times you are
          not available, and no one asks you to babysit a new app.
        </p>
        <div data-finale-line className="pt-2">
          <Button asChild variant="action" size="lg" className="text-base">
            <Link href="/sign-up">Join as a trainer</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
