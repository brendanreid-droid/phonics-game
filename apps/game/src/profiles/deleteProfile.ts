import type { ProgressRepo } from '../data/ProgressRepo';
import type { ProfileRepo } from './ProfileRepo';

/**
 * Deletes a child: their learning record first, then the profile itself.
 *
 * The order is the point. The progress is stored under the profile's id, so if
 * the profile row went first and the clear then failed, the record would be
 * orphaned with no id left to find it by. This way a failure leaves the
 * profile in place, still listed, and the grown-up can simply try again.
 *
 * Rejects if the progress could not be cleared; the profile is then untouched.
 */
export async function deleteProfile(id: string, profiles: ProfileRepo, progress: ProgressRepo): Promise<void> {
  await progress.clear(id);
  await profiles.remove(id);
}
