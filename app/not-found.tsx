import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Branded 404 (interior-polish ruling 4): notFound() fires from real
 * in-scope pages (an expired thread link, a delisted trainer URL), and
 * the stock Next page broke the product illusion. Minimal on purpose —
 * one card, one way home.
 */
export default function NotFound() {
  return (
    <main className="bg-muted flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>That page isn&apos;t here</CardTitle>
          <CardDescription>
            The link may be old, or what it pointed at is no longer
            available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to PawMatch</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
