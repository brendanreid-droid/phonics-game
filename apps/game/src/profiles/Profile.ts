export interface Profile {
  id: string;
  /** Typed once by a grown-up. The child never types anything. */
  name: string;
  avatarId: string;
  createdAt: number;
  /** Local date string (YYYY-MM-DD) of the last quest finished. */
  lastPlayedOn: string | null;
}

export const MAX_NAME_LENGTH = 20;

/** Trims and collapses inner whitespace. Does not change case. */
export function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Why a name cannot be used, or null if it can.
 *
 * Duplicate detection ignores case and spacing, because two profiles both
 * showing "Ada" are indistinguishable to a child choosing by name — and the
 * face is what they actually read, so a near-duplicate is worse here than in
 * an adult product.
 */
export function nameError(raw: string, existingNames: readonly string[]): string | null {
  const name = normaliseName(raw);
  if (name.length === 0) return 'Please type a name.';
  if (name.length > MAX_NAME_LENGTH) return `Please use a shorter name (${MAX_NAME_LENGTH} letters or fewer).`;

  const taken = existingNames.some((existing) => normaliseName(existing).toLowerCase() === name.toLowerCase());
  if (taken) return `There is already someone called ${name}.`;

  return null;
}
