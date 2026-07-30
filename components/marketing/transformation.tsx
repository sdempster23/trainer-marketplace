"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { MARKETING_IMAGES } from "@/lib/marketing/image-manifest";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Section 1: the transformation. One idea: finding the right trainer,
 * solved. Asymmetric split (text left, photo right), pet-owner-first voice.
 *
 * Motion, and why:
 * - Headline and body rise in once on arrival (24px, 0.55s, expo ease,
 *   short stagger): hierarchy, the claim lands line by line.
 * - The photo settles from a 1.05 scale as the section enters (scrubbed):
 *   continuity with the hero's camera language.
 * Reduced motion: everything static, content always in the markup.
 */
export function TransformationSection() {
  const ref = useRef<HTMLElement>(null);
  const { image, alt } = MARKETING_IMAGES.transformation;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".tf-line", {
          y: 24,
          autoAlpha: 0,
          duration: 0.55,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: ref.current,
            start: "top 70%",
            once: true,
          },
        });
        gsap.from(".tf-photo", {
          scale: 1.05,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "top 25%",
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
      className="mx-auto grid w-full max-w-[1400px] items-center gap-10 px-6 py-24 sm:px-10 sm:py-36 lg:grid-cols-[2fr_3fr] lg:gap-16"
    >
      <div className="flex max-w-xl flex-col gap-6">
        <h2 className="tf-line font-display text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-6xl">
          The right match changes the whole journey.
        </h2>
        <p className="tf-line text-muted-foreground text-lg leading-relaxed">
          Puppy basics, leash manners, or trial-ready precision. See the
          trainers who actually do that work, near you.
        </p>
      </div>
      <div className="relative overflow-hidden rounded-xl">
        <Image
          src={image}
          alt={alt}
          sizes="(min-width: 1024px) 60vw, 100vw"
          placeholder="blur"
          className="tf-photo h-auto w-full object-cover"
        />
      </div>
    </section>
  );
}
