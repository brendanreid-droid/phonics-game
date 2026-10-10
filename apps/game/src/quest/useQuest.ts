import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { AudioService } from '@soundlings/audio';
import type { ProgressRepo } from '../data/ProgressRepo';
import type { HintTier } from '../tasks/useHintLadder';
import { QuestRunner } from './QuestRunner';
import type { QuestView } from './QuestRunner';

export type { QuestView } from './QuestRunner';

/**
 * Puts a quest on screen. All the judgement, ordering and saving is in
 * `QuestRunner`, which has no React in it so that it can be tested; this hook
 * only starts it and re-renders when its view changes.
 */
export function useQuest(args: {
  profileId: string;
  level: number;
  repo: ProgressRepo;
  audio: AudioService;
  now: () => number;
  markPlayed?: (date: string) => Promise<void>;
}): { state: QuestView; answer: (given: string, tier: HintTier) => void } {
  const { profileId, level, repo, audio, now } = args;

  // Held in a ref and read when called, so that a new callback on every render
  // does not rebuild the runner, which would restart the quest underneath the
  // child. The runner needs only the latest one at the moment a quest finishes.
  const markPlayedRef = useRef(args.markPlayed);
  markPlayedRef.current = args.markPlayed;

  const runner = useMemo(
    () =>
      new QuestRunner({
        profileId,
        level,
        repo,
        audio,
        now,
        markPlayed: (date) => markPlayedRef.current?.(date) ?? Promise.resolve(),
      }),
    [profileId, level, repo, audio, now],
  );

  // Starting is idempotent, so a development remount cannot load the quest twice.
  useEffect(() => {
    void runner.start();
  }, [runner]);

  const state = useSyncExternalStore(runner.subscribe, runner.getView, runner.getView);
  const answer = useCallback((given: string, tier: HintTier) => void runner.answer(given, tier), [runner]);

  return { state, answer };
}
