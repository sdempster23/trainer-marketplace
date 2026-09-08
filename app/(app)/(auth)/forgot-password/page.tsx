import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Reset your password — PawMatch" };

/**
 * SERVER page: owns the title and the h1 (the card IS the page); the form
 * is the client leaf.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Reset your password</CardTitle>
          <CardDescription>
            Enter the email you signed up with and we&apos;ll send you a reset
            link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
