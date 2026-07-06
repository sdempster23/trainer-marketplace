"use client";

/**
 * Message timestamps render in the VIEWER's zone — the one surface where
 * neither party's stored zone is right (owners have no zone anywhere in the
 * schema; a trainer reading owner messages shouldn't get the owner's clock
 * either — a conversation reads in your own time). That requires the
 * browser's zone, hence a client component; storage stays UTC per the house
 * rule, conversion at the display edge only.
 *
 * Formatters are module-scope: this renders per message per 30s refresh
 * tick, and Intl.DateTimeFormat construction is the expensive part.
 * Prior-year instants state the year — "Jul 3" must not read as two days
 * ago when it was last July.
 *
 * suppressHydrationWarning: the server render formats in the server's zone
 * and hydration re-formats in the browser's — the mismatch is the point.
 */

const SAME_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const OTHER_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function LocalTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const isSameYear = date.getFullYear() === new Date().getFullYear();
  const formatted = (isSameYear ? SAME_YEAR_FORMAT : OTHER_YEAR_FORMAT).format(
    date,
  );
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatted}
    </time>
  );
}
