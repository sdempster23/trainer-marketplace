"use client";

import { useRef } from "react";
import { Geist_Mono } from "next/font/google";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// preload: false keeps this font off the homepage's critical path (the
// numbers live far below the fold; the H1 is the LCP element).
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});

/**
 * Section 5: truthful numbers only (the contract bans invented volume
 * stats; there are no users to count and that is the launch's point).
 * - 15: minute calendar sync interval (shipped, gate ruling 3; the
 *   trainer-facing app copy states the same number).
 * - 0: double-books by design (busy times gate bookable slots, M15/M16).
 * - $0: platform fees on sessions (payments are off-platform).
 *
 * Motion, and why: the 15 counts up once when the row enters (the number
 * "arrives"; storytelling, and it draws the eye to the only stat that is
 * a measurement rather than a design fact). The rows rise in once.
 * Reduced motion: static values, no count.
 */
const STATS = [
  { value: "15", prefix: "", suffix: " min", countTo: 15, label: "between calendar syncs, both directions" },
  { value: "0", prefix: "", suffix: "", countTo: null, label: "double-books, by design" },
  { value: "0", prefix: "$", suffix: "", countTo: null, label: "platform fees on sessions" },
] as const;

export function NumbersSection() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".stat-row", {
          y: 24,
          autoAlpha: 0,
          duration: 0.55,
          ease: "expo.out",
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: "top 70%", once: true },
        });
        const counter = { n: 0 };
        const target = ref.current?.querySelector(".stat-count");
        if (target) {
          gsap.to(counter, {
            n: 15,
            duration: 0.9,
            ease: "power2.out",
            snap: { n: 1 },
            onUpdate: () => {
              target.textContent = String(counter.n);
            },
            scrollTrigger: { trigger: ref.current, start: "top 70%", once: true },
          });
        }
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      className={`mx-auto grid w-full max-w-[1400px] gap-14 px-6 py-24 sm:px-10 sm:py-36 lg:grid-cols-3 ${geistMono.variable}`}
    >
      {STATS.map((stat) => (
        <div key={stat.label} className="stat-row flex flex-col gap-3">
          <p className="font-mono text-6xl font-medium tracking-tight sm:text-7xl">
            {stat.prefix}
            {stat.countTo ? (
              <span className="stat-count">{stat.value}</span>
            ) : (
              stat.value
            )}
            {stat.suffix}
          </p>
          <p className="text-muted-foreground max-w-[28ch] text-base leading-relaxed">
            {stat.label}
          </p>
        </div>
      ))}
    </section>
  );
}
