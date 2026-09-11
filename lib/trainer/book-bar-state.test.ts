import { describe, expect, test } from "vitest";

import { bookBarState } from "./book-bar-state";

/**
 * The three-way rule for the profile's sticky Book bar, pinned as a table.
 * The failed-read rows are the ones that matter most: a fault must NEVER
 * render as "nothing bookable" — this unit table is the only place that
 * case can be pinned (a server-side read cannot be broken from Playwright).
 */
describe("bookBarState", () => {
  const owner = { isLoggedIn: true, isOwner: true };
  const loggedOut = { isLoggedIn: false, isOwner: false };
  const trainer = { isLoggedIn: true, isOwner: false };

  test.each([
    // failed read: never a zero — the Book link stays (the book page's own read is the retry)
    ["failed read, owner", "boom", 0, owner, "book"],
    ["failed read, logged-out", "boom", 0, loggedOut, "book"],
    ["failed read, trainer", "boom", 0, trainer, "none"],
    // honest zero: the message fallback
    ["zero, owner", null, 0, owner, "message"],
    ["zero, logged-out", null, 0, loggedOut, "login-to-message"],
    ["zero, trainer", null, 0, trainer, "none"],
    // at least one service: unchanged
    ["one service, owner", null, 1, owner, "book"],
    ["three services, logged-out", null, 3, loggedOut, "book"],
    ["one service, trainer", null, 1, trainer, "none"],
  ] as const)("%s → %s", (_label, servicesError, serviceCount, viewer, expected) => {
    expect(bookBarState({ servicesError, serviceCount, viewer })).toBe(expected);
  });
});
