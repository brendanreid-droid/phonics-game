import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import { avatarById } from './avatars';
import { HoldButton } from './HoldButton';
import type { Profile } from './Profile';

/**
 * The confirmation before a child, and everything they have learned, is
 * deleted. Cancel is the easy path; confirming takes a two-second hold.
 */
export function DeleteProfileSheet(props: {
  profile: Profile | null;
  onCancel: () => void;
  onDelete: (profile: Profile) => Promise<void>;
}) {
  const { profile, onCancel, onDelete } = props;
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFailed(false);
    setBusy(false);
  }, [profile?.id]);

  const confirm = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onDelete(profile);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Modal visible={profile !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        {profile ? (
          <View style={styles.sheet}>
            <Text style={styles.face}>{avatarById(profile.avatarId).emoji}</Text>
            <Text style={styles.heading}>Delete {profile.name}?</Text>
            <Text style={styles.body}>Everything they have learned will be lost.</Text>
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {failed ? 'Could not delete. Nothing was removed - please try again.' : ' '}
            </Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.cancel}>
                <Text style={styles.cancelText}>Keep {profile.name}</Text>
              </Pressable>
              <HoldButton label="Hold to delete" disabled={busy} onConfirm={() => void confirm()} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(58, 48, 40, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.md,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: tokens.color.paper,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    alignItems: 'center',
  },
  face: { fontSize: 64 },
  heading: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  body: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft, textAlign: 'center' },
  error: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft, minHeight: 20 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: tokens.space.md,
  },
  cancel: { height: tokens.tap.control, paddingHorizontal: tokens.space.lg, justifyContent: 'center' },
  cancelText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
});
