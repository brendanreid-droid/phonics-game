import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AudioService } from '@soundlings/audio';
import type { ProgressRepo } from '../data/ProgressRepo';
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
}): { state: QuestView; answer: (given: string) => void } {
  const { profileId, level, repo, audio, now } = args;

  const runner = useMemo(
    () => new QuestRunner({ profileId, level, repo, audio, now }),
    [profileId, level, repo, audio, now],
  );

  // Starting is idempotent, so a development remount cannot load the quest twice.
  useEffect(() => {
    void runner.start();
  }, [runner]);

  const state = useSyncExternalStore(runner.subscribe, runner.getView, runner.getView);
  const answer = useCallback((given: string) => void runner.answer(given), [runner]);

  return { state, answer };
}
