import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Home() {
  return (
    <main className="bg-muted min-h-screen">
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-24 text-center">
        <div className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
          Phase 0 · scaffold
        </div>
        <h1 className="text-foreground text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          PawMatch
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-balance">
          Find a professional dog trainer who fits your dog, your schedule, and your goals.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg">Find a trainer</Button>
          <Button size="lg" variant="outline">
            I am a trainer
          </Button>
        </div>

        <Card className="mt-12 w-full text-left">
          <CardHeader>
            <CardTitle>Theme check</CardTitle>
            <CardDescription>
              Verifying navy primary, amber accent, and neutral surfaces render from globals.css.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <span className="bg-primary text-primary-foreground inline-flex items-center rounded-md px-3 py-1 text-xs font-medium">
                primary
              </span>
              <span className="bg-accent text-accent-foreground inline-flex items-center rounded-md px-3 py-1 text-xs font-medium">
                accent
              </span>
              <span className="bg-secondary text-secondary-foreground inline-flex items-center rounded-md px-3 py-1 text-xs font-medium">
                secondary
              </span>
              <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-md border px-3 py-1 text-xs font-medium">
                muted
              </span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Sample email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
