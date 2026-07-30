"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { UI_SHOTS } from "@/lib/marketing/ui-shots";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Section 4: the interface inside a realistic device. Section 2 showed the
 * product on phones; this is the one desktop moment: a single large
 * display frame with the real directory at 1440px.
 *
 * Motion, and why: the display settles from 0.95 scale and rises as it
 * enters (scrubbed): continuity with the hero and section-1 camera
 * language, and it gives the one big artifact a sense of weight. Static
 * under reduced motion.
 */
export function DevicesSection() {
  const ref = useRef<HTMLElement>(null);
  const { image, alt, caption } = UI_SHOTS.desktop;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".device-screen", {
          scale: 0.95,
          y: 48,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "top 20%",
            scrub: true,
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-8 px-6 py-24 sm:px-10 sm:py-32"
    >
      <div className="device-screen w-full rounded-2xl bg-[#131316] p-2.5 shadow-2xl shadow-black/15 sm:p-3">
        <div className="overflow-hidden rounded-xl">
          <Image
            src={image}
            alt={alt}
            sizes="(min-width: 1200px) 1140px, 92vw"
            className="h-auto w-full"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-base">{caption}</p>
    </section>
  );
}
