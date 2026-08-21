"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Branded error boundary (interior-polish ruling 4): an uncaught render/
 * data error previously served Next's stock error page (the directory
 * throws on read failure by design). Minimal: own the fault, offer
 * retry + home. Client component by Next contract; the console.error
 * below runs in the BROWSER (prod strips server messages to a digest
 * before they reach this boundary), and nothing is ever rendered.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ERROR-BOUNDARY]", error);
  }, [error]);

  return (
    <main className="bg-muted flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong on our end</CardTitle>
          <CardDescription>
            It&apos;s not you — the page hit an error. Trying again usually
            fixes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button onClick={reset} className="w-full">
            Try again
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to PawMatch</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
