import { useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioService } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';
import { ExpoClipPlayer } from '../src/audio/ExpoClipPlayer';
import { AsyncStorageProgressRepo } from '../src/data/AsyncStorageProgressRepo';
import { useQuest } from '../src/quest/useQuest';
import { componentFor } from '../src/tasks/registry';

/** Plan 2 replaces this with the selected child profile. */
const PROFILE_ID = 'dev-profile';

export default function QuestScreen() {
  const router = useRouter();

  const audio = useMemo(() => {
    const player = new ExpoClipPlayer();
    void player.configure();
    return new AudioService(player);
  }, []);

  const repo = useMemo(() => new AsyncStorageProgressRepo(), []);
  const now = useMemo(() => () => Date.now(), []);

  const { state, answer } = useQuest({ profileId: PROFILE_ID, level: 1, repo, audio, now });

  // Navigation is an effect, not something done while rendering.
  useEffect(() => {
    if (state.status !== 'finished') return;
    router.replace({
      pathname: '/results',
      params: { stars: String(state.stars), creatures: state.newCreatures.join(',') },
    });
  }, [state.status, state.stars, state.newCreatures, router]);

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Something went wrong starting your quest.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status !== 'playing' || !state.task) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  const TaskComponent = componentFor(state.task.taskTypeId);

  return (
    // Keyed on the task so each one starts with clean state: two tasks in a
    // row can be the same mini-game, and without the key React would reuse the
    // component and carry the last task's selection, tiles and timers into it.
    <TaskComponent
      key={state.task.id}
      task={state.task}
      audio={audio}
      externalTier={state.tier}
      onAnswer={answer}
      position={{ index: state.index, total: state.total }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    gap: tokens.space.lg,
    padding: tokens.space.xl,
  },
  message: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink, textAlign: 'center' },
  back: {
    paddingHorizontal: tokens.space.xl,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
});
