/**
 * The six complete_profile facts. Pure so the rule is unit-tested without
 * a live DB or the service-role emit path. App code gathers the flags
 * (own-row RLS; calendar = row exists, never the url column) and asks
 * this whether the trainer just crossed the line.
 */
export function isProfileComplete(flags: {
  hasPhoto: boolean;
  hasBio: boolean;
  hasCredentials: boolean;
  hasSpecialties: boolean;
  hasPricedService: boolean;
  hasCalendar: boolean;
}): boolean {
  return (
    flags.hasPhoto &&
    flags.hasBio &&
    flags.hasCredentials &&
    flags.hasSpecialties &&
    flags.hasPricedService &&
    flags.hasCalendar
  );
}
