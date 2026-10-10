import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LEVELS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { avatarById } from '../src/profiles/avatars';
import { useProfile } from '../src/profiles/ProfileContext';
import { canResume } from '../src/quest/questLogic';
import { islandFor } from '../src/progress/island';
import type { IslandView } from '../src/progress/island';
import { currentLevel } from '../src/progress/levelCards';
import { localDateString } from '../src/progress/streaks';

/**
 * The child's home screen, and their progress map. The creature collection is
 * the progress bar: unhatched creatures are eggs rather than hidden, so a child
 * can see there are seven friends and which they have yet to meet.
 */
export default function Island() {
  const router = useRouter();
  const { ready, selected, select, progress } = useProfile();
  const [view, setView] = useState<{ island: IslandView; level: number } | null>(null);

  const profileId = selected?.id ?? null;
  const lastPlayedOn = selected?.lastPlayedOn ?? null;

  // Reloaded every time the island comes back into view: a quest finished
  // since, or a creature hatched, must show without leaving and re-entering.
  useFocusEffect(
    useCallback(() => {
      if (profileId === null) return;
      let cancelled = false;
      void (async () => {
        const [mastery, active, playedDates, completions] = await Promise.all([
          progress.loadMastery(profileId),
          progress.loadActiveSession(profileId),
          progress.loadPlayedDates(profileId),
          progress.loadCompletions(profileId),
        ]);
        if (cancelled) return;
        const now = Date.now();
        const level = currentLevel(LEVELS, completions);
        setView({
          level,
          island: islandFor({
            level,
            mastery,
            hasQuestInProgress: canResume(active, level),
            lastPlayedOn,
            playedDates,
            today: localDateString(now),
            now,
          }),
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [progress, profileId, lastPlayedOn]),
  );

  // A deep link, or storage cleared underneath us: nobody owns this island.
  if (ready && selected === null) return <Redirect href="/" />;

  if (!selected || !view) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  const { island, level } = view;
  const avatar = avatarById(selected.avatarId);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View accessible accessibilityLabel={`${selected.name}'s island`} style={styles.who}>
          <Text style={styles.whoFace}>{avatar.emoji}</Text>
          <Text style={styles.whoName}>{selected.name}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not you?"
          onPress={() => {
            void select(null).then(() => router.replace('/'));
          }}
          style={styles.link}
        >
          <Text style={styles.linkText}>Not you?</Text>
        </Pressable>
      </View>

      <View style={styles.middle}>
        <View
          accessible
          accessibilityLabel={`${island.hatchedCount} of ${island.totalCount} friends hatched`}
          style={styles.collection}
        >
          {island.collection.map(({ creature, hatched }) => (
            <View key={creature.id} style={[styles.slot, hatched ? styles.slotHatched : styles.slotEgg]}>
              <Text style={[styles.slotEmoji, !hatched && styles.eggEmoji]}>{hatched ? creature.emoji : '🥚'}</Text>
              <Text style={styles.slotName}>{hatched ? creature.name : ' '}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.streak}>{island.streakLine ?? ' '}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={island.playLabel}
          onPress={() => router.push({ pathname: '/quest', params: { level: String(level) } })}
          style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
        >
          <Text style={styles.playText}>{island.playLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.bottomBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Levels" onPress={() => router.push('/levels')} style={styles.link}>
          <Text style={styles.linkText}>Levels</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Trophies" onPress={() => router.push('/trophies')} style={styles.link}>
          <Text style={styles.linkText}>Trophies</Text>
        </Pressable>
      </View>
    </View>
  );
}

const SLOT_W = 92;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.paper },
  screen: { flex: 1, backgroundColor: tokens.color.paper, padding: tokens.space.md },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.tile,
  },
  whoFace: { fontSize: 32 },
  whoName: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.md },
  collection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.space.sm + 4,
  },
  slot: {
    width: SLOT_W,
    height: SLOT_W + 24,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
  },
  // A hatched friend is a raised, lit card; an egg is a flat, dashed hollow.
  // The two must differ at a glance, without reading anything.
  slotHatched: { backgroundColor: tokens.color.tile, borderBottomWidth: 5, borderBottomColor: tokens.color.tileEdge },
  slotEgg: { borderWidth: 2, borderStyle: 'dashed', borderColor: tokens.color.tileEdge },
  slotEmoji: { fontSize: 52 },
  eggEmoji: { opacity: 0.45 },
  slotName: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.ink },
  streak: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft, minHeight: 24 },
  play: {
    minWidth: tokens.tap.primary,
    height: tokens.tap.primary,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPressed: { transform: [{ scale: 0.96 }] },
  playText: { fontFamily: tokens.font.ui, fontSize: tokens.type.word - 8, color: tokens.color.onAccent },
  bottomBar: { flexDirection: 'row', justifyContent: 'center', gap: tokens.space.xl },
  link: { minHeight: tokens.tap.min, paddingHorizontal: tokens.space.md, justifyContent: 'center' },
  linkText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption + 2, color: tokens.color.inkSoft },
});
