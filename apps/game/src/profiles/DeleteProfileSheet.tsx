import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import { avatarById } from './avatars';
import { PinGate } from '../parent/PinGate';
import { useProfile } from './ProfileContext';
import type { Profile } from './Profile';

/**
 * The confirmation before a child, and everything they have learned, is
 * deleted. Cancel is the easy path; confirming asks for the grown-up PIN, which
 * can be used from a keyboard or a screen reader where the press-and-hold it
 * replaced could not.
 */
export function DeleteProfileSheet(props: {
  profile: Profile | null;
  onCancel: () => void;
  onDelete: (profile: Profile) => Promise<void>;
}) {
  const { profile, onCancel, onDelete } = props;
  const { pin } = useProfile();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setFailed(false);
    setBusy(false);
    setAsking(false);
  }, [profile?.id]);

  const confirm = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setFailed(false);
    setAsking(false);
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
            {asking ? (
              <PinGate
                pin={pin}
                reason={`To delete ${profile.name}`}
                onUnlocked={() => void confirm()}
                onCancel={() => setAsking(false)}
              />
            ) : (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.cancel}>
                  <Text style={styles.cancelText}>Keep {profile.name}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${profile.name}`}
                  accessibilityHint="Asks for the grown-up PIN"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => setAsking(true)}
                  style={[styles.delete, busy && styles.deleteDisabled]}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            )}
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
  delete: {
    minWidth: 160,
    height: tokens.tap.control,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.notThis,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDisabled: { opacity: 0.4 },
  deleteText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  cancelText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
});
