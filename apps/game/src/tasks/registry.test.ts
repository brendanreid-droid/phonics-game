import { describe, expect, it, vi } from 'vitest';

// The components import React Native, which Node cannot load (Flow syntax,
// native modules). The registry only needs them to exist as values, so the
// native libraries are replaced with inert stand-ins.
vi.mock('react-native', () => ({
  StyleSheet: { create: <T>(styles: T) => styles },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withRepeat: (value: unknown) => value,
  withSequence: (...values: unknown[]) => values,
  withTiming: (value: unknown) => value,
}));

import { TASK_TYPES } from '@soundlings/engine';
import { TASK_COMPONENTS, componentFor } from './registry';

describe('task registry', () => {
  it('registers a component for every task type the engine can schedule', () => {
    const missing = TASK_TYPES.filter((t) => !(t.id in TASK_COMPONENTS)).map((t) => t.id);
    expect(missing, `no component for: ${missing.join(', ')}`).toEqual([]);
  });

  it('registers nothing the engine does not know about', () => {
    const known = new Set(TASK_TYPES.map((t) => t.id));
    const extra = Object.keys(TASK_COMPONENTS).filter((id) => !known.has(id));
    expect(extra, `orphan components: ${extra.join(', ')}`).toEqual([]);
  });

  it('returns a function component for each id', () => {
    for (const type of TASK_TYPES) expect(typeof componentFor(type.id)).toBe('function');
  });

  it('throws, naming the id, for a task type nobody registered', () => {
    expect(() => componentFor('no-such-game')).toThrow(/no-such-game/);
  });
});
