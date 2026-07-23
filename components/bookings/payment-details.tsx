import { paymentLinks } from "@/lib/validators/payment";

/**
 * The owner-facing payment display on a CONFIRMED booking (M17). Renders the
 * trainer's off-platform instructions (escaped text) and clickable Venmo/
 * PayPal links BUILT BY THE APP from validated handles — never a
 * user-supplied href. Renders nothing if the trainer set no payment info.
 */
export function PaymentDetails({
  info,
}: {
  info: {
    instructions: string | null;
    venmo_handle: string | null;
    paypal_handle: string | null;
  };
}) {
  const links = paymentLinks(info);
  const hasAnything = info.instructions || links.venmo || links.paypal;
  if (!hasAnything) return null;

  return (
    <div className="border-border bg-muted/40 mt-1 flex flex-col gap-1.5 rounded-md border p-3">
      <span className="text-muted-foreground text-xs font-medium">
        How to pay {"— arranged directly with the trainer"}
      </span>
      {info.instructions ? (
        <p className="text-sm whitespace-pre-line">{info.instructions}</p>
      ) : null}
      {links.venmo || links.paypal ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {links.venmo ? (
            <a
              href={links.venmo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Venmo: @{info.venmo_handle}
            </a>
          ) : null}
          {links.paypal ? (
            <a
              href={links.paypal}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              PayPal: {info.paypal_handle}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
