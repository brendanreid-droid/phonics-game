import { avatarById } from './avatars';
import { nameError, normaliseName } from './Profile';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

/** In-memory ProfileRepo for tests and for development. */
export class MemoryProfileRepo implements ProfileRepo {
  private profiles: Profile[] = [];

  private selected: string | null = null;

  /**
   * Never reused, even after a removal. An id handed out twice would let a new
   * child inherit the progress saved under a deleted one.
   */
  private counter = 0;

  async list(): Promise<Profile[]> {
    // Copied on the way out: a caller must not be able to edit stored state
    // by mutating what they were handed.
    return this.profiles
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => ({ ...p }));
  }

  async create(args: CreateProfileArgs): Promise<Profile> {
    const problem = nameError(args.name, this.profiles.map((p) => p.name));
    if (problem) throw new Error(problem);
    avatarById(args.avatarId); // throws on an unknown avatar

    this.counter += 1;
    const profile: Profile = {
      id: `p${this.counter}-${args.now}`,
      name: normaliseName(args.name),
      avatarId: args.avatarId,
      createdAt: args.now,
      lastPlayedOn: null,
    };
    this.profiles.push(profile);
    return { ...profile };
  }

  async remove(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.selected === id) this.selected = null;
  }

  async selectedId(): Promise<string | null> {
    return this.selected;
  }

  async select(id: string | null): Promise<void> {
    if (id !== null && !this.profiles.some((p) => p.id === id)) {
      throw new Error(`Unknown profile: ${id}`);
    }
    this.selected = id;
  }

  async markPlayed(id: string, date: string): Promise<void> {
    const profile = this.profiles.find((p) => p.id === id);
    if (profile) profile.lastPlayedOn = date;
  }
}
