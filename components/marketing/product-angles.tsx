"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { UI_SHOTS } from "@/lib/marketing/ui-shots";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Owner touchpoints only (two-act constitution): the calendar-bridge
// screen moved to the trainer act, where its audience lives.
const SHOTS = [UI_SHOTS.directory, UI_SHOTS.profile, UI_SHOTS.thread];

/**
 * Section 2: the product from multiple angles. Real screenshots (see
 * lib/marketing/ui-shots.ts for the truthful-imagery provenance) inside
 * minimal graphite device frames, panned horizontally.
 *
 * Motion, and why:
 * - Desktop, motion allowed: the section pins and vertical scroll drives a
 *   horizontal pan across the four screens (tasteskill 5.B canonical
 *   skeleton: pin the wrapper, scrub the track). Reason: storytelling; one
 *   product, four angles, one continuous camera move.
 * - Mobile and prefers-reduced-motion: the SAME track is a native
 *   scroll-snap strip. No hijack, no pin; swiping is the natural gesture.
 *   This is also the no-JS state, so content is never hostage to GSAP.
 */
export function ProductAnglesSection() {
  const wrap = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          const trackEl = track.current;
          if (!trackEl) return;
          // Native horizontal scrolling off while GSAP drives the pan.
          trackEl.classList.remove("overflow-x-auto", "snap-x");
          const distance = () => trackEl.scrollWidth - window.innerWidth;
          gsap.to(trackEl, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: wrap.current,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });
          return () => {
            trackEl.classList.add("overflow-x-auto", "snap-x");
          };
        },
      );
    },
    { scope: wrap },
  );

  return (
    <section ref={wrap} className="bg-muted/60 overflow-hidden py-20 sm:py-0">
      <div className="flex min-h-[100dvh] flex-col justify-center gap-12">
        <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-10">
          <h2 className="font-display max-w-2xl text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-6xl">
            This is PawMatch
          </h2>
          <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed">
            The directory, a profile, and a conversation. Real screens from
            the app as it works today.
          </p>
        </div>

        <div
          ref={track}
          className="flex snap-x snap-mandatory gap-8 overflow-x-auto px-6 pb-4 sm:px-10 lg:gap-16 lg:pl-[max(2.5rem,calc((100vw-1400px)/2+2.5rem))]"
        >
          {/* Each slide pairs the device with its caption so a desktop
              slide is ~640px wide: four slides overflow the viewport and
              give the pinned pan a real journey (a 4x300px phone row fits
              in 1440px and pans nowhere). */}
          {SHOTS.map((shot) => (
            <figure
              key={shot.title}
              className="flex w-[78vw] max-w-[320px] shrink-0 snap-center flex-col gap-5 lg:w-[640px] lg:max-w-none lg:flex-row lg:items-center lg:gap-10"
            >
              {/* Minimal graphite bezel; the screen content is a real
                  capture, the frame is presentation chrome. */}
              <div className="rounded-[2.25rem] bg-[#131316] p-2.5 shadow-xl shadow-black/10 lg:order-2 lg:w-[300px] lg:shrink-0">
                <div className="overflow-hidden rounded-[1.75rem]">
                  <Image
                    src={shot.image}
                    alt={shot.alt}
                    sizes="(min-width: 1024px) 300px, 78vw"
                    className="h-auto w-full"
                  />
                </div>
              </div>
              <figcaption className="flex flex-col gap-2 px-1 lg:order-1 lg:w-[300px]">
                <span className="font-display text-lg font-bold tracking-tight lg:text-2xl">
                  {shot.title}
                </span>
                <span className="text-muted-foreground text-sm leading-relaxed lg:text-base">
                  {shot.caption}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
