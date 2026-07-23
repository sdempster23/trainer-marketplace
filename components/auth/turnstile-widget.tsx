"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget (the signup bot gate, client half). Renders the
 * challenge and writes its token into a hidden input named
 * `cf-turnstile-response`, which the signup Server Action verifies.
 *
 * FAIL VISIBLE: if the site key is unset or the Cloudflare script won't load,
 * the component shows a clear message instead of a silent missing widget — the
 * user always understands why they can't submit. (The server ALSO fails closed,
 * so a bypassed client can't get through either.)
 *
 * SINGLE-USE token handling: a Turnstile token is consumed by the first
 * server verification. After a FAILED submit (e.g. email already registered),
 * the spent token would reject every retry — so the parent bumps `resetSignal`
 * when the action returns an error, and we reset the widget to mint a fresh
 * token. The widget also renders idempotently on mount, so an SPA soft-nav
 * back to /sign-up (script already loaded, onLoad may not re-fire) still shows
 * the challenge.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export function TurnstileWidget({ resetSignal = 0 }: { resetSignal?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  function renderWidget() {
    if (!siteKey || !containerRef.current || !window.turnstile) return;
    // Idempotent: if we already rendered into this container, don't stack a
    // second widget (soft-nav / double onLoad).
    if (widgetIdRef.current !== null) return;
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        "response-field-name": "cf-turnstile-response",
        "error-callback": () => setStatus("error"),
      });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  // Render on mount if the script is already present (covers SPA soft-nav
  // where next/script's onLoad won't re-fire).
  useEffect(() => {
    if (!siteKey) {
      setStatus("error");
      return;
    }
    if (window.turnstile) renderWidget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  // Mint a fresh token whenever the parent signals a failed submit.
  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!siteKey) {
    return (
      <p role="alert" className="text-destructive text-sm">
        The human-verification check isn&apos;t configured. Signup is
        temporarily unavailable — please try again shortly.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
        onError={() => setStatus("error")}
      />
      <div ref={containerRef} />
      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          Couldn&apos;t load the human-verification check. Refresh and try
          again, or check your connection.
        </p>
      ) : null}
    </div>
  );
}
