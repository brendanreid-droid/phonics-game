import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVELS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { useProfile } from '../src/profiles/ProfileContext';
import { currentLevel } from '../src/progress/levelCards';
import { trophiesFrom } from '../src/progress/trophies';
import { trophyTilesFrom } from '../src/progress/trophyTiles';
import type { TrophyTile } from '../src/progress/trophyTiles';
import { BackLink } from '../src/shell/BackLink';

/**
 * The trophy room: achievements only. No error count, no accuracy, nothing a
 * child could read as a mark against them. The honest diagnostic picture is for
 * the parent area, because that is a conversation between adults.
 */
export default function Trophies() {
  const { ready, selected, progress } = useProfile();
  const [tiles, setTiles] = useState<TrophyTile[] | null>(null);
  const profileId = selected?.id ?? null;

  useFocusEffect(
    useCallback(() => {
      if (profileId === null) return;
      let cancelled = false;
      void (async () => {
        const [mastery, highScores, playedDates, completions] = await Promise.all([
          progress.loadMastery(profileId),
          progress.loadHighScores(profileId),
          progress.loadPlayedDates(profileId),
          progress.loadCompletions(profileId),
        ]);
        if (cancelled) return;
        const level = currentLevel(LEVELS, completions);
        setTiles(trophyTilesFrom(trophiesFrom({ level, mastery, highScores, playedDates, now: Date.now() })));
      })();
      return () => {
        cancelled = true;
      };
    }, [progress, profileId]),
  );

  if (ready && selected === null) return <Redirect href="/" />;
  if (!tiles) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <BackLink />
        <Text style={styles.title}>Trophies</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            accessible
            accessibilityLabel={`${tile.label}: ${tile.value}`}
            style={[styles.tile, !tile.earned && styles.tileUnearned]}
          >
            <Text style={[styles.emoji, !tile.earned && styles.emojiUnearned]}>{tile.emoji}</Text>
            <Text
              style={[
                styles.value,
                tile.key === 'stars' && tile.earned && styles.starValue,
                !tile.earned && styles.valueUnearned,
              ]}
            >
              {tile.value}
            </Text>
            <Text style={styles.label}>{tile.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.paper },
  screen: { flex: 1, backgroundColor: tokens.color.paper, padding: tokens.space.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSpacer: { width: 96 },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  grid: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    alignSelf: 'center',
    // Three to a row: six tiles read as two even rows, not four and two.
    maxWidth: 3 * 200 + 2 * tokens.space.md + 2 * tokens.space.md,
    gap: tokens.space.md,
    padding: tokens.space.md,
  },
  tile: {
    width: 200,
    height: 180,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
  },
  // Unearned: a flat dashed hollow, like the island's eggs, so the earned
  // tiles are what the eye lands on.
  tileUnearned: { backgroundColor: 'transparent', borderBottomWidth: 0, borderWidth: 2, borderStyle: 'dashed', borderColor: tokens.color.tileEdge },
  emoji: { fontSize: 40 },
  emojiUnearned: { opacity: 0.3 },
  valueUnearned: { fontSize: tokens.type.body + 2, color: tokens.color.inkSoft, opacity: 0.8 },
  value: { fontFamily: tokens.font.ui, fontSize: tokens.type.title + 4, color: tokens.color.ink },
  starValue: { color: tokens.color.gold },
  label: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
});
