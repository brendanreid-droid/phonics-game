import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVELS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { useProfile } from '../src/profiles/ProfileContext';
import { levelCards } from '../src/progress/levelCards';
import type { LevelCard } from '../src/progress/levelCards';
import { BackLink } from '../src/shell/BackLink';

/**
 * One card per level. A finished level reads as finished from the latch, not
 * from the live calculation, so it stays finished however long ago it was.
 */
export default function Levels() {
  const router = useRouter();
  const { ready, selected, progress } = useProfile();
  const [cards, setCards] = useState<LevelCard[] | null>(null);
  const profileId = selected?.id ?? null;

  useFocusEffect(
    useCallback(() => {
      if (profileId === null) return;
      let cancelled = false;
      void (async () => {
        const [mastery, completions] = await Promise.all([
          progress.loadMastery(profileId),
          progress.loadCompletions(profileId),
        ]);
        if (!cancelled) setCards(levelCards({ levels: LEVELS, mastery, completions, now: Date.now() }));
      })();
      return () => {
        cancelled = true;
      };
    }, [progress, profileId]),
  );

  if (ready && selected === null) return <Redirect href="/" />;
  if (!cards) {
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
        <Text style={styles.title}>Levels</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {cards.map((card) => (
          <Pressable
            key={card.number}
            accessibilityRole="button"
            accessibilityLabel={`${card.name}${card.state === 'locked' ? ', locked' : card.state === 'complete' ? ', complete' : ''}`}
            accessibilityState={{ disabled: !card.playable }}
            disabled={!card.playable}
            onPress={() => router.push({ pathname: '/quest', params: { level: String(card.number) } })}
            style={({ pressed }) => [
              styles.card,
              card.state === 'locked' && styles.cardLocked,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardHead}>
              <Text style={styles.number}>{card.number}</Text>
              <Text style={styles.name}>{card.state === 'locked' ? 'Coming soon' : card.name}</Text>
              {card.state === 'complete' ? <Text style={styles.done}>Complete ★</Text> : null}
              {card.state === 'locked' ? <Text style={styles.lock}>🔒</Text> : null}
            </View>

            {card.state !== 'locked' ? (
              <View style={styles.faces}>
                {card.creatures.map(({ creature, hatched }) => (
                  <Text key={creature.id} style={[styles.face, !hatched && styles.egg]}>
                    {hatched ? creature.emoji : '🥚'}
                  </Text>
                ))}
              </View>
            ) : null}

            {card.state === 'in-progress' ? (
              <View accessible accessibilityLabel={`${Math.round(card.fraction * 100)} percent`} style={styles.track}>
                <View style={[styles.bar, { width: `${Math.max(4, Math.round(card.fraction * 100))}%` }]} />
              </View>
            ) : null}
          </Pressable>
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
  list: { alignItems: 'center', padding: tokens.space.md, gap: tokens.space.md },
  card: {
    width: '100%',
    maxWidth: 640,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.tileEdge,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  cardLocked: { backgroundColor: 'transparent', borderBottomWidth: 0, borderWidth: 2, borderColor: tokens.color.line, opacity: 0.6 },
  cardPressed: { transform: [{ scale: 0.98 }] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
  number: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.inkSoft },
  name: { flex: 1, fontFamily: tokens.font.ui, fontSize: tokens.type.body + 4, color: tokens.color.ink },
  done: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink, backgroundColor: tokens.color.correct, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.xs },
  lock: { fontSize: 28 },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  face: { fontSize: 36 },
  egg: { opacity: 0.45 },
  track: { height: 14, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accent },
});
