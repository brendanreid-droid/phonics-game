import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isPlaceholderPack } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';
import { AddProfileSheet } from '../src/profiles/AddProfileSheet';
import { DeleteProfileSheet } from '../src/profiles/DeleteProfileSheet';
import { avatarById } from '../src/profiles/avatars';
import { useProfile } from '../src/profiles/ProfileContext';
import type { Profile } from '../src/profiles/Profile';

/**
 * Who is playing? The first screen a child sees, so it works with no reading:
 * a row of large faces, tap yours. Names are for the grown-up.
 *
 * Choosing a face is never gated, and neither is adding one. Deleting a profile
 * asks for the grown-up PIN (see DeleteProfileSheet).
 */
export default function ProfilePicker() {
  const router = useRouter();
  const { ready, profiles, create, remove, select } = useProfile();

  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  // With nobody yet, the add sheet opens by itself. If the grown-up backs out
  // of it, it stays closed until there has been somebody and then nobody again.
  const [dismissedWhileEmpty, setDismissedWhileEmpty] = useState(false);

  useEffect(() => {
    if (profiles.length > 0) setDismissedWhileEmpty(false);
  }, [profiles.length]);

  // Leaving manage mode when there is nothing left to manage.
  useEffect(() => {
    if (profiles.length === 0) setManaging(false);
  }, [profiles.length]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  const sheetOpen = adding || (profiles.length === 0 && !dismissedWhileEmpty);

  const play = async (profile: Profile) => {
    await select(profile.id);
    router.replace('/island');
  };

  return (
    <View style={styles.screen}>
      {isPlaceholderPack() ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Placeholder voice — not for use with children</Text>
        </View>
      ) : null}

      <Text style={styles.title}>Soundlings</Text>

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.row}
        showsVerticalScrollIndicator={false}
      >
        {profiles.map((profile) => (
          <View key={profile.id} style={styles.slot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play as ${profile.name}`}
              onPress={() => void play(profile)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Text style={styles.face}>{avatarById(profile.avatarId).emoji}</Text>
              <Text numberOfLines={1} style={styles.name}>
                {profile.name}
              </Text>
            </Pressable>
            {managing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${profile.name}`}
                onPress={() => setDeleting(profile)}
                style={styles.deleteBadge}
              >
                <Text style={styles.deleteBadgeText}>Delete</Text>
              </Pressable>
            ) : (
              // Holds the badge's place, so the faces do not jump when
              // manage mode is switched on.
              <View style={styles.badgeSpace} />
            )}
          </View>
        ))}

        <View style={styles.slot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a player"
            onPress={() => setAdding(true)}
            style={({ pressed }) => [styles.card, styles.addCard, pressed && styles.cardPressed]}
          >
            <Text style={styles.plus}>+</Text>
            <Text style={styles.name}>Add</Text>
          </Pressable>
          <View style={styles.badgeSpace} />
        </View>
      </ScrollView>

      {profiles.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={managing ? 'Done' : 'Grown-ups'}
          onPress={() => setManaging((m) => !m)}
          style={styles.grownUps}
        >
          <Text style={styles.grownUpsText}>{managing ? 'Done' : 'Grown-ups'}</Text>
        </Pressable>
      ) : null}

      <AddProfileSheet
        visible={sheetOpen}
        existing={profiles}
        onCancel={() => {
          setAdding(false);
          if (profiles.length === 0) setDismissedWhileEmpty(true);
        }}
        onCreate={async ({ name, avatarId }) => {
          await create({ name, avatarId });
          setAdding(false);
        }}
      />

      <DeleteProfileSheet
        profile={deleting}
        onCancel={() => setDeleting(null)}
        onDelete={async (profile) => {
          await remove(profile.id);
          setDeleting(null);
        }}
      />
    </View>
  );
}

const CARD_W = 168;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.paper },
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: tokens.color.paper,
    paddingTop: tokens.space.xxl,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.md,
  },
  banner: {
    position: 'absolute',
    top: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.hint,
  },
  bannerText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.ink },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  scroller: { flex: 1, alignSelf: 'stretch' },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    gap: tokens.space.lg,
    padding: tokens.space.md,
  },
  slot: { alignItems: 'center', gap: tokens.space.sm },
  card: {
    width: CARD_W,
    height: CARD_W + 32,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.sm,
  },
  cardPressed: { transform: [{ scale: 0.96 }] },
  addCard: { backgroundColor: 'transparent', borderWidth: 3, borderStyle: 'dashed', borderColor: tokens.color.tileEdge },
  face: { fontSize: 88 },
  plus: { fontFamily: tokens.font.ui, fontSize: 72, color: tokens.color.inkSoft, lineHeight: 88 },
  name: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body + 2,
    color: tokens.color.ink,
    maxWidth: CARD_W - tokens.space.md,
  },
  badgeSpace: { height: tokens.tap.min },
  deleteBadge: {
    height: tokens.tap.min,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.notThis,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBadgeText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.ink },
  grownUps: {
    position: 'absolute',
    right: tokens.space.md,
    bottom: tokens.space.md,
    minHeight: tokens.tap.min,
    paddingHorizontal: tokens.space.md,
    justifyContent: 'center',
  },
  grownUpsText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
