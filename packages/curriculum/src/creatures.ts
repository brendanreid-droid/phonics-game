import type { Creature } from './types';

/**
 * One Soundling per grapheme. Each name begins with its own grapheme so that
 * saying the creature's name rehearses the sound the child just mastered — the
 * reward is the lesson, not a sticker bolted onto it.
 */
export const CREATURE_LIST: Creature[] = [
  { id: 'sisi', name: 'Sisi', graphemeId: 's', emoji: '🐍' },
  { id: 'ada', name: 'Ada', graphemeId: 'a', emoji: '🍎' },
  { id: 'tito', name: 'Tito', graphemeId: 't', emoji: '🧸' },
  { id: 'popo', name: 'Popo', graphemeId: 'p', emoji: '🐷' },
  { id: 'indi', name: 'Indi', graphemeId: 'i', emoji: '🐛' },
  { id: 'momo', name: 'Momo', graphemeId: 'm', emoji: '🌙' },
  { id: 'fifi', name: 'Fifi', graphemeId: 'f', emoji: '🐟' },
];

export const CREATURES: Record<string, Creature> = Object.fromEntries(
  CREATURE_LIST.map((c) => [c.id, c]),
);
