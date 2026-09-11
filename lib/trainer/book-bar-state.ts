/**
 * The ONE home for the profile's booking-affordance rule (zero-services fix,
 * 2026-09-11; design in docs/scratch/book-without-services-fix-proposal.md).
 *
 * Three states of the services read, never two:
 *  - a FAILED read is not a zero — the bar keeps the Book link (the book
 *    page performs its own read, so the link is the retry) and never claims
 *    "nothing bookable" from a fault; the Services section's ErrorState
 *    carries the fault;
 *  - an honest ZERO gets the flow's existing fallback (the no-open-times
 *    pattern): message the trainer — or log in to;
 *  - one or more services: Book, unchanged.
 * Trainers and admins get no bar at all (they cannot be the owner side of
 * a thread, and self-preview must not offer self-booking).
 *
 * Pure so the failed-read rows can be pinned in a unit table — a
 * server-side read cannot be broken from an e2e run.
 */
export type BookBarViewer = { isLoggedIn: boolean; isOwner: boolean };

export type BookBarState = "book" | "message" | "login-to-message" | "none";

export function bookBarState({
  servicesError,
  serviceCount,
  viewer,
}: {
  servicesError: string | null;
  serviceCount: number;
  viewer: BookBarViewer;
}): BookBarState {
  if (viewer.isLoggedIn && !viewer.isOwner) {
    return "none";
  }
  if (servicesError !== null || serviceCount > 0) {
    return "book";
  }
  return viewer.isOwner ? "message" : "login-to-message";
}

/**
 * The approved zero-services sentence (Shane, 2026-09-11), shared by the
 * profile bar and the book page so both surfaces say the same thing in the
 * same words. No terminal punctuation: each surface appends its own next
 * step. Deliberately neutral on history — services soft-delete, so a
 * trainer who removed every service reads identically to one who never
 * added any, and "yet" would assert something the page cannot know.
 */
export function notTakingBookings(displayName: string): string {
  return `${displayName} isn't taking bookings right now`;
}
