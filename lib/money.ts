import type { Database } from "@/types/supabase";

export type Currency = Database["public"]["Enums"]["currency_code"];

/** New services use the saved listing country. Existing services and bookings
 * keep their stored currency, even if the trainer later moves. */
export function currencyForCountry(countryCode: string): Currency | null {
  switch (countryCode) {
    case "US": return "USD";
    case "CA": return "CAD";
    case "GB": return "GBP";
    default: return null;
  }
}
