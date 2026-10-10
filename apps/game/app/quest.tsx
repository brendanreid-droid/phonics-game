import { useEffect, useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioService } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';
import { ExpoClipPlayer } from '../src/audio/ExpoClipPlayer';
import { useProfile } from '../src/profiles/ProfileContext';
import { levelFromParam } from '../src/progress/levelCards';
import { useQuest } from '../src/quest/useQuest';
import { componentFor } from '../src/tasks/registry';

export default function QuestScreen() {
  const { ready, selected } = useProfile();

  // A deep link, or storage cleared mid-quest: starting a quest nobody owns
  // would write a child's progress under no one.
  if (ready && selected === null) return <Redirect href="/" />;
  if (!selected) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }
  return <Quest profileId={selected.id} />;
}

function Quest({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { progress, markPlayed } = useProfile();
  const params = useLocalSearchParams<{ level?: string }>();
  const level = levelFromParam(params.level);

  const audio = useMemo(() => {
    const player = new ExpoClipPlayer();
    void player.configure();
    return new AudioService(player);
  }, []);

  const now = useMemo(() => () => Date.now(), []);

  const { state, answer } = useQuest({
    profileId,
    level,
    repo: progress,
    audio,
    now,
    markPlayed: (date) => markPlayed(profileId, date),
  });

  // Navigation is an effect, not something done while rendering.
  useEffect(() => {
    if (state.status !== 'finished') return;
    router.replace({
      pathname: '/results',
      params: { stars: String(state.stars), creatures: state.newCreatures.join(','), level: String(level) },
    });
  }, [state.status, state.stars, state.newCreatures, level, router]);

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Something went wrong starting your quest.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
          onPress={() => router.replace('/island')}
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
