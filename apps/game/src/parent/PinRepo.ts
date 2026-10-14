/**
 * The grown-up PIN.
 *
 * This stops a child, not an adult. Anyone holding the device can clear its
 * storage, and the "forgot it" path says so out loud, so nothing here pretends
 * to be a security boundary. It exists so a five-year-old cannot wander into
 * their own progress data and tap "delete".
 *
 * Plan 5 may move this behind an account. The interface is the seam.
 */
export interface PinRepo {
  /** Whether a PIN has been chosen. Decides between "enter PIN" and "choose one". */
  isSet(): Promise<boolean>;
  /**
   * Chooses a PIN, replacing any existing one. Rejects for anything that is not
   * four digits, leaving what was there alone, and rejects when the PIN could
   * not be saved: a PIN that silently failed to persist would leave a grown-up
   * believing the gate is on when it is not.
   */
  set(pin: string): Promise<void>;
  /** False for a wrong PIN, for a malformed one, and when no PIN is set. */
  verify(pin: string): Promise<boolean>;
  /**
   * Forgets the PIN. Idempotent. Rejects when it could not finish, because the
   * "forgot it" path tells the grown-up it worked, and a reset that quietly
   * failed would lock them out of their own child's data.
   */
  clear(): Promise<void>;
}
