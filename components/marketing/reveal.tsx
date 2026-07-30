"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * One-shot entrance for marketing sections: children marked with
 * [data-line] rise 24px and fade in when the wrapper enters the viewport
 * (hierarchy: the claim lands line by line). Fires once, never scrubbed,
 * transform/opacity only, static under prefers-reduced-motion.
 *
 * Server sections stay server components and wrap their text in this leaf.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-line]", {
          y: 24,
          autoAlpha: 0,
          duration: 0.55,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: ref.current,
            start: "top 75%",
            once: true,
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
