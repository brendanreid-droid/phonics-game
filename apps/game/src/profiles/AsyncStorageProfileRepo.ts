import AsyncStorage from '@react-native-async-storage/async-storage';
import { newUuid } from '@soundlings/api';
import { avatarById, knownAvatar } from './avatars';
import { nameError, normaliseName } from './Profile';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

const PROFILES_KEY = 'soundlings/profiles';
const SELECTED_KEY = 'soundlings/selectedProfile';

/**
 * What reading the profile list produced. `io` is kept apart from "empty"
 * because a read-modify-write that could not read what is there must not
 * write: treating a transient storage failure as an empty list would let the
 * next create replace every profile in the household with one.
 */
type ProfilesRead =
  | {
      kind: 'ok';
      profiles: Profile[];
      /** The stored text, if any of it was unusable. Set aside before it is overwritten. */
      damagedRaw: string | null;
    }
  | { kind: 'io' };

/**
 * Device-backed ProfileRepo.
 *
 * Every operation is serialised through one queue, for the same reason
 * AsyncStorageProgressRepo serialises: AsyncStorage has no transactions, so two
 * overlapping read-modify-writes silently lose one of them, and losing a
 * profile loses a child's whole history.
 *
 * Failure policy differs from the progress repo in one place, deliberately.
 * `create` and `remove` reject when they cannot save: a profile that silently
 * fails to persist leaves a child playing into a void, and the picker can only
 * say so if it is told. Marking a day played, like progress, is best effort.
 */
export class AsyncStorageProfileRepo implements ProfileRepo {
  private tail: Promise<unknown> = Promise.resolve();

  list(): Promise<Profile[]> {
    return this.serial(async () => {
      const read = await this.readProfiles();
      return read.kind === 'ok' ? sorted(read.profiles) : [];
    });
  }

  create(args: CreateProfileArgs): Promise<Profile> {
    return this.serial(async () => {
      const read = await this.readForUpdate();
      const problem = nameError(args.name, read.profiles.map((p) => p.name));
      if (problem) throw new Error(problem);
      avatarById(args.avatarId); // throws on an unknown avatar

      const profile: Profile = {
        id: this.newId(read.profiles),
        name: normaliseName(args.name),
        avatarId: args.avatarId,
        createdAt: args.now,
        lastPlayedOn: null,
      };
      // Not caught: see the class comment.
      await this.writeProfiles([...read.profiles, profile]);
      return { ...profile };
    });
  }

  adopt(profile: Profile): Promise<void> {
    return this.serial(async () => {
      const read = await this.readForUpdate();
      if (read.profiles.some((p) => p.id === profile.id)) return;
      await this.writeProfiles([...read.profiles, { ...profile, avatarId: knownAvatar(profile.avatarId) }]);
    });
  }

  remove(id: string): Promise<void> {
    return this.serial(async () => {
      const read = await this.readForUpdate();
      await this.writeProfiles(read.profiles.filter((p) => p.id !== id));
      if ((await this.readSelected()) === id) await this.writeSelected(null);
    });
  }

  selectedId(): Promise<string | null> {
    return this.serial(async () => {
      const id = await this.readSelected();
      if (id === null) return null;
      // A selection with no profile behind it (the list was lost or damaged)
      // is no selection: handing it on would send a child into a profile the
      // picker cannot show.
      const read = await this.readProfiles();
      return read.kind === 'ok' && read.profiles.some((p) => p.id === id) ? id : null;
    });
  }

  select(id: string | null): Promise<void> {
    return this.serial(async () => {
      if (id !== null) {
        const read = await this.readProfiles();
        if (read.kind !== 'ok') throw new Error('Could not read the saved profiles.');
        if (!read.profiles.some((p) => p.id === id)) throw new Error(`Unknown profile: ${id}`);
      }
      await this.writeSelected(id);
    });
  }

  markPlayed(id: string, date: string): Promise<void> {
    return this.serial(async () => {
      const read = await this.readProfiles();
      // Best effort. If the list cannot be read, writing would replace it.
      if (read.kind !== 'ok') return;
      if (!read.profiles.some((p) => p.id === id)) return;
      if (read.damagedRaw !== null) await this.quarantine(read.damagedRaw);
      try {
        await this.writeProfiles(read.profiles.map((p) => (p.id === id ? { ...p, lastPlayedOn: date } : p)));
      } catch {
        // A missed play-day costs a streak tick, not a profile.
      }
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Reads for a read-modify-write: refuses to continue if the list is unreadable. */
  private async readForUpdate(): Promise<{ profiles: Profile[] }> {
    const read = await this.readProfiles();
    if (read.kind !== 'ok') throw new Error('Could not read the saved profiles.');
    if (read.damagedRaw !== null) await this.quarantine(read.damagedRaw);
    return { profiles: read.profiles };
  }

  private async readProfiles(): Promise<ProfilesRead> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(PROFILES_KEY);
    } catch {
      return { kind: 'io' };
    }
    if (raw === null) return { kind: 'ok', profiles: [], damagedRaw: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'ok', profiles: [], damagedRaw: raw };
    }
    if (!Array.isArray(parsed)) return { kind: 'ok', profiles: [], damagedRaw: raw };

    // Keep the entries that are sound; if any were not, the original is set
    // aside before the cleaned list replaces it.
    const profiles = parsed.filter(isProfile);
    return { kind: 'ok', profiles, damagedRaw: profiles.length === parsed.length ? null : raw };
  }

  private async writeProfiles(profiles: Profile[]): Promise<void> {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  private async readSelected(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  }

  private async writeSelected(id: string | null): Promise<void> {
    try {
      if (id === null) await AsyncStorage.removeItem(SELECTED_KEY);
      else await AsyncStorage.setItem(SELECTED_KEY, id);
    } catch {
      // A failed write costs the remembered selection, not the profile.
    }
  }

  private async quarantine(raw: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`${PROFILES_KEY}.corrupt`, raw);
    } catch {
      // Best effort only.
    }
  }

  /**
   * Never an id already in use by a live profile: progress is stored under it.
   * The random part makes a clash vanishingly rare; the suffix loop makes it
   * impossible, and unlike re-rolling it terminates whatever the random source.
   */
  private newId(existing: readonly Profile[]): string {
    // A UUID, because the id is also the row's key on the server if the parent
    // signs in. Profiles made before sync have short ids; the sync layer maps
    // those to a UUID itself (see remoteProfileId in @soundlings/api).
    let id = newUuid();
    while (existing.some((p) => p.id === id)) id = newUuid();
    return id;
  }
}

function sorted(profiles: Profile[]): Profile[] {
  return profiles.slice().sort((a, b) => a.createdAt - b.createdAt);
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<Profile>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.avatarId === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.lastPlayedOn === null || typeof p.lastPlayedOn === 'string')
  );
}
