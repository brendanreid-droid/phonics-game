import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import { AVATARS, nextAvatarFor } from './avatars';
import { MAX_NAME_LENGTH, nameError } from './Profile';
import type { Profile } from './Profile';

/**
 * Where a grown-up adds a child. The child never types: a grown-up types the
 * name once and the child is known thereafter by the face they pick.
 *
 * Creating is not gated: adding a player destroys nothing, and a grown-up
 * setting the device up for the first time should not meet a PIN before
 * anything exists. Deleting is the gated act (see DeleteProfileSheet).
 */
export function AddProfileSheet(props: {
  visible: boolean;
  existing: readonly Profile[];
  onCancel: () => void;
  onCreate: (args: { name: string; avatarId: string }) => Promise<void>;
}) {
  const { visible, existing, onCancel, onCreate } = props;
  const takenAvatars = useMemo(() => existing.map((p) => p.avatarId), [existing]);

  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState(() => nextAvatarFor(takenAvatars).id);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // A fresh form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setName('');
    setSaveFailed(false);
    setSaving(false);
    setAvatarId(nextAvatarFor(takenAvatars).id);
    // takenAvatars is deliberately not a dependency: it changes when a profile
    // is created, which closes the sheet anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // No error until something has been typed: opening the sheet to "Please type
  // a name" is a telling-off before the grown-up has done anything.
  const typed = name.trim().length > 0;
  const problem = typed ? nameError(name, existing.map((p) => p.name)) : null;
  const canAdd = typed && problem === null && !saving;

  const add = async () => {
    if (!canAdd) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await onCreate({ name, avatarId });
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Add a player</Text>
          <Text style={styles.instruction}>
            Grown-ups: type a name and pick a face.
          </Text>

          <TextInput
            accessibilityLabel="Name"
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={tokens.color.inkSoft}
            maxLength={MAX_NAME_LENGTH + 5}
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.input}
          />
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {problem ?? (saveFailed ? 'Could not save. Please try again.' : ' ')}
          </Text>

          <View style={styles.faces}>
            {AVATARS.map((avatar) => {
              const taken = takenAvatars.includes(avatar.id);
              const chosen = avatar.id === avatarId;
              return (
                <Pressable
                  key={avatar.id}
                  accessibilityRole="button"
                  accessibilityLabel={taken ? `${avatar.label} (already used)` : avatar.label}
                  accessibilityState={{ selected: chosen, disabled: taken }}
                  disabled={taken}
                  onPress={() => setAvatarId(avatar.id)}
                  style={[styles.face, chosen && styles.faceChosen, taken && styles.faceTaken]}
                >
                  <Text style={styles.faceEmoji}>{avatar.emoji}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              accessibilityState={{ disabled: !canAdd }}
              disabled={!canAdd}
              onPress={() => void add()}
              style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>
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
    maxWidth: 640,
    backgroundColor: tokens.color.paper,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  heading: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  instruction: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  input: {
    height: tokens.tap.control,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: tokens.color.tileEdge,
    backgroundColor: tokens.color.tile,
    paddingHorizontal: tokens.space.md,
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body,
    color: tokens.color.ink,
  },
  // Always takes up its line, so the faces below do not jump when it appears.
  error: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft, minHeight: 20 },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm, justifyContent: 'center' },
  face: {
    width: tokens.tap.control + 8,
    height: tokens.tap.control + 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.tile,
    borderWidth: 3,
    borderColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceChosen: { borderColor: tokens.color.accent, backgroundColor: tokens.color.hint },
  faceTaken: { opacity: 0.3 },
  faceEmoji: { fontSize: 36 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.space.md,
  },
  cancel: { height: tokens.tap.control, paddingHorizontal: tokens.space.lg, justifyContent: 'center' },
  addButton: {
    minWidth: 160,
    height: tokens.tap.control,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  cancelText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
});
