"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { SEARCH_DEMO } from "@/lib/marketing/ui-shots";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Act 1's live proof: a muted 10-second loop of a REAL search recorded
 * against the production build (provenance in lib/marketing/ui-shots.ts).
 *
 * Performance and motion contract:
 * - preload="none" + poster: nothing loads until the user nears the
 *   section (the play() call triggers the fetch), so the hero's LCP and
 *   the mobile perf budget are untouched.
 * - ScrollTrigger plays the loop while the section is on screen and
 *   pauses it off screen (feedback-free background motion is rationed).
 * - prefers-reduced-motion: the video never plays; the poster frame (a
 *   real results screen) is the whole experience. Same for no-JS and for
 *   browsers without WebM support.
 */
export function SearchDemoSection() {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: ref.current,
          start: "top 75%",
          end: "bottom 10%",
          onEnter: () => videoRef.current?.play().catch(() => {}),
          onEnterBack: () => videoRef.current?.play().catch(() => {}),
          onLeave: () => videoRef.current?.pause(),
          onLeaveBack: () => videoRef.current?.pause(),
        });
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-8 px-6 py-16 sm:px-10 sm:py-24"
    >
      <div className="w-full rounded-2xl bg-[#131316] p-2.5 shadow-2xl shadow-black/15 sm:p-3">
        <div className="overflow-hidden rounded-xl">
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            poster={SEARCH_DEMO.poster.src}
            width={1280}
            height={800}
            aria-label={SEARCH_DEMO.alt}
            className="h-auto w-full"
          >
            <source src={SEARCH_DEMO.videoSrc} type="video/webm" />
          </video>
        </div>
      </div>
      <p className="text-muted-foreground text-base">
        One real search, uncut. Location, specialty, profile.
      </p>
    </section>
  );
}
