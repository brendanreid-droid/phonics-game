export interface Avatar {
  id: string;
  /** Stand-in art, consistent with the creature placeholders. */
  emoji: string;
  /** Spoken and shown to the grown-up when choosing. */
  label: string;
}

/**
 * The fixed set of faces a child can be.
 *
 * Fixed rather than free choice, and faces rather than photographs: typing is
 * beyond most five-year-olds, and a camera roll is a privacy problem this
 * product does not need. The child identifies their profile by its face, so
 * the faces must be easy to tell apart at a glance — no two cats.
 */
export const AVATARS: readonly Avatar[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'bear', emoji: '🐻', label: 'Bear' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon' },
];

export function avatarById(id: string): Avatar {
  const found = AVATARS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown avatar: ${id}`);
  return found;
}

/** The first face nobody has taken, or the first of all if they are all used. */
export function nextAvatarFor(takenIds: readonly string[]): Avatar {
  return AVATARS.find((a) => !takenIds.includes(a.id)) ?? AVATARS[0];
}
