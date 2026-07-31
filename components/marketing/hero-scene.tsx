"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scroll choreography for the hero (client leaf; the hero itself stays a
 * Server Component passed as children, so the photo is still SSR'd for LCP).
 *
 * Motion, and why it exists (Emil bar: every move needs a one-sentence
 * reason):
 * - The photo zooms 1 -> 1.06 as you scroll past: depth. The scene recedes
 *   as the story starts, like a camera pulling focus.
 * - The promise block drifts up slightly faster than the scroll (parallax)
 *   and fades: a handoff that says "the promise was made, now the proof."
 *
 * Both are scrubbed (no autonomous animation), transform/opacity only, and
 * disabled entirely under prefers-reduced-motion via gsap.matchMedia.
 *
 * LCP guard: the H1 inside .hero-promise is the page's LCP element.
 * Creating the tweens at hydration writes transform/visibility styles to
 * its container, which re-registers the text paint and inflates LCP by
 * seconds on throttled mobile. So the tweens are created on the FIRST
 * scroll intent instead: before any scroll they would sit at progress 0
 * (visually identical), and after first input the LCP measurement window
 * has already closed. The once-only listener is a bootstrap, not a
 * scroll-driven animation handler.
 */
export function HeroScene({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const init = contextSafe!(() => {
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.to(".hero-media", {
            scale: 1.06,
            ease: "none",
            scrollTrigger: {
              trigger: ref.current,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
          gsap.to(".hero-promise", {
            yPercent: -18,
            autoAlpha: 0,
            ease: "none",
            scrollTrigger: {
              trigger: ref.current,
              start: "top top",
              end: "75% top",
              scrub: true,
            },
          });
        });
      });
      window.addEventListener("scroll", init, { once: true, passive: true });
      return () => window.removeEventListener("scroll", init);
    },
    { scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}
