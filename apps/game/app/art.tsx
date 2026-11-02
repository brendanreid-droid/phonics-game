import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CREATURE_LIST } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { CreatureArt, EggArt } from '../src/art/creatures';
import type { CreatureId } from '../src/art/creatures';

/**
 * The creature sheet. A development screen, deliberately not linked from
 * anywhere a child can reach.
 *
 * It exists for the same reason `trace.test.ts` prints the first ten quests:
 * **where the artefact a child would meet can be looked at, look at it.** A
 * creature that is charming at 200pt and unreadable at 40pt is a creature that
 * fails on the island, and no unit test will ever say so.
 *
 * Three rows, each answering a different question:
 *
 *  - **At size** — 40pt, which is what the island actually renders. Judge them
 *    here and nowhere else.
 *  - **Silhouette** — filled solid ink. This is the acceptance test the
 *    illustration brief sets for commissioned artwork (docs/ARTWORK-BRIEF.md),
 *    applied to our own drawings so we are not holding someone else to a bar we
 *    skipped. A child identifies a small picture by its outline first; if two
 *    creatures are the same black blob, they are the same creature.
 *  - **Egg and hatching** — what a child sees before they have earned it.
 *
 * Reachable at /art while the dev server is running.
 */
export default function ArtSheet() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Creature sheet</Text>
      <Text style={styles.note}>
        A development screen. Judge the drawings at the size the island renders them, not larger.
      </Text>

      <Text style={styles.heading}>At size — 40pt, as the island draws them</Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c) => (
          <View key={c.id} style={styles.cell}>
            <View style={styles.tile}>
              <CreatureArt id={c.id as CreatureId} size={40} />
            </View>
            <Text style={styles.label}>{c.name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Larger — 72pt, for the hatching moment</Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c) => (
          <View key={c.id} style={styles.cell}>
            <View style={[styles.tile, styles.tileBig]}>
              <CreatureArt id={c.id as CreatureId} size={72} />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Silhouette — the test that matters</Text>
      <Text style={styles.note}>
        Solid ink, at size. Any two that read as the same shape are two creatures a five-year-old
        cannot tell apart.
      </Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c) => (
          <View key={c.id} style={styles.cell}>
            <View style={styles.tile}>
              <CreatureArt id={c.id as CreatureId} size={40} flat />
            </View>
            <Text style={styles.label}>{c.name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>The island, half finished — what a child actually sees</Text>
      <Text style={styles.note}>
        Three hatched, four to go. The row has to read as a collection in progress: the eggs
        present enough to be worth earning, the creatures distinct enough to be worth having.
      </Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c, i) => (
          <View key={c.id} style={[styles.slot, i < 3 ? styles.slotHatched : styles.slotEgg]}>
            {i < 3 ? (
              <CreatureArt id={c.id as CreatureId} size={40} />
            ) : (
              <EggArt id={c.id as CreatureId} size={40} />
            )}
            <Text style={styles.label}>{i < 3 ? c.name : ' '}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Eggs — tinted, never revealing</Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c) => (
          <View key={c.id} style={styles.cell}>
            <View style={styles.tile}>
              <EggArt id={c.id as CreatureId} size={40} />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Hatching</Text>
      <View style={styles.row}>
        {CREATURE_LIST.map((c) => (
          <View key={c.id} style={styles.cell}>
            <View style={styles.tile}>
              <EggArt id={c.id as CreatureId} size={40} hatching />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: tokens.space.xl, gap: tokens.space.md, backgroundColor: tokens.color.paper },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  heading: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body,
    color: tokens.color.ink,
    marginTop: tokens.space.lg,
  },
  note: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md, alignItems: 'flex-start' },
  cell: { alignItems: 'center', gap: tokens.space.xs },
  tile: {
    width: tokens.tap.control,
    height: tokens.tap.control,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBig: { width: 96, height: 96 },
  // Copied from island.tsx so the preview shows the real slot, not an
  // approximation of it.
  slot: {
    width: 72,
    height: 88,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
  },
  slotHatched: { backgroundColor: tokens.color.tile },
  slotEgg: { borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.color.line },
  label: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
