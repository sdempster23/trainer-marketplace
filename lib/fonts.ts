import { Geist_Mono } from "next/font/google";

/**
 * Geist Mono — the identity's data voice (gate ruling 3: LOAD IT,
 * route-level). Deliberately NOT in the root layout: root-layout fonts
 * preload on every route and the homepage H1 is the LCP element (see
 * app/layout.tsx). Routes that render data in mono import this and put
 * `geistMono.variable` on their outermost element; `font-mono` then
 * resolves through the `--font-geist-mono` chain in globals.css.
 * preload:false keeps it off the render-critical path — mono is
 * data-label seasoning, never above-the-fold display type.
 *
 * Ruling 3's escape hatch: if walked-page LCP measurably regresses,
 * report and fall back to `tabular-nums` Inter.
 */
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});
