import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IslandScene, PaperGrain, StarArt } from '../src/art/Scenery';
import { CreatureArt } from '../src/art/creatures';
import type { CreatureId } from '../src/art/creatures';
import { CREATURES } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { levelFromParam } from '../src/progress/levelCards';
import { creatureIdsFromParam, starsFromParam } from '../src/quest/questLogic';

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stars?: string; creatures?: string; level?: string }>();

  const stars = starsFromParam(params.stars);
  const creatures = creatureIdsFromParam(params.creatures).flatMap((id) => {
    const creature = CREATURES[id];
    return creature ? [creature] : [];
  });

  // No auto-advance and no countdown. The child decides when to leave.
  return (
    <View style={styles.screen}>
      {/* The island, because this is the moment a child has earned something on
          it — the results screen was the one place a flat fill felt like a
          dialog box rather than an arrival. */}
      <IslandScene />
      <PaperGrain />
      <Text style={styles.title}>All done!</Text>

      <View accessible accessibilityLabel={`${stars} out of 3 stars`} style={styles.stars}>
        {[0, 1, 2].map((i) => (
          <StarArt key={i} size={64} earned={i < stars} />
        ))}
      </View>

      {creatures.length > 0 ? (
        <View style={styles.hatched}>
          <Text style={styles.hatchedTitle}>
            {creatures.length === 1 ? 'A new friend hatched!' : 'New friends hatched!'}
          </Text>
          <View style={styles.creatureRow}>
            {creatures.map((creature) => (
              <View key={creature.id} style={styles.creature}>
                {/* The one place a creature is drawn big, on a card of its own.
                    This is the moment the whole product exists for, and at 72pt
                    on bare paper it was a detail on the screen rather than the
                    subject of it — the stars above were four times its size. */}
                <View style={styles.creatureCard}>
                  <CreatureArt id={creature.id as CreatureId} size={96} />
                </View>
                <Text style={styles.creatureName}>{creature.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/*
        The primary action is stopping. An app for five-year-olds that nudges
        "one more round" is optimising for screen time against the parent's
        interests, and parents can tell.
      */}
      <Text style={styles.enough}>That&apos;s enough for today. Come back tomorrow!</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finish"
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={() => router.dismissTo('/island')}
      >
        <Text style={styles.primaryText}>Finish</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play one more quest"
        style={styles.secondary}
        onPress={() => router.replace({ pathname: '/quest', params: { level: String(levelFromParam(params.level)) } })}
      >
        <Text style={styles.secondaryText}>One more</Text>
      </Pressable>
    </View>
  );
}

// No fontWeight anywhere: the weight is part of the family name for the UI face
// as well as the letter face, and setting one too makes the browser fake a
// second bolding.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    gap: tokens.space.md,
    padding: tokens.space.xl,
  },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  stars: { flexDirection: 'row', gap: tokens.space.sm },
  hatched: { alignItems: 'center', gap: tokens.space.sm },
  hatchedTitle: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  creatureRow: { flexDirection: 'row', gap: tokens.space.lg },
  creature: { alignItems: 'center', gap: tokens.space.xs },
  creatureCard: {
    width: 128,
    height: 128,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.tileEdge,
    shadowColor: tokens.color.ink,
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  creatureName: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  enough: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body,
    color: tokens.color.inkSoft,
    textAlign: 'center',
    marginTop: tokens.space.md,
  },
  primary: {
    paddingHorizontal: tokens.space.xl,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.96 }] },
  primaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  secondary: { paddingHorizontal: tokens.space.lg, height: tokens.tap.min, justifyContent: 'center' },
  secondaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
