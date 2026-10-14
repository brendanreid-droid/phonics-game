import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVELS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { PinGate } from '../src/parent/PinGate';
import { markUnlocked } from '../src/parent/unlockSession';
import { useSync } from '../src/sync/SyncContext';
import type { SyncStatus } from '../src/sync/SyncService';
import { parentSummary } from '../src/parent/parentSummary';
import type { ParentSummary } from '../src/parent/parentSummary';
import type { SoundState } from '../src/parent/soundReport';
import { useProfile } from '../src/profiles/ProfileContext';
import { currentLevel } from '../src/progress/levelCards';
import { BackLink } from '../src/shell/BackLink';

/**
 * The grown-up's view, behind the PIN.
 *
 * It answers three questions, in the order a worried parent would stop reading:
 * is a person needed (only if so), which sounds does my child know, what are
 * they mixing up, and what do I do about it. Plain counts come last and small.
 * No charts and no percentages: a parent reads "68% correct" as a school mark.
 *
 * All the thinking is in parentSummary(); this file only lays it out.
 */
export default function Parent() {
  const router = useRouter();
  const { ready, selected, progress, pin } = useProfile();
  const [unlocked, setUnlocked] = useState(false);
  const [summary, setSummary] = useState<ParentSummary | null>(null);
  const { status: sync, syncNow } = useSync();

  const profileId = selected?.id ?? null;

  // Locked again whenever the screen is left, so coming back asks again.
  useFocusEffect(
    useCallback(() => {
      if (profileId === null || !unlocked) return;
      let cancelled = false;
      void (async () => {
        const [mastery, attempts, playedDates, completions] = await Promise.all([
          progress.loadMastery(profileId),
          progress.loadAttempts(profileId),
          progress.loadPlayedDates(profileId),
          progress.loadCompletions(profileId),
        ]);
        if (cancelled) return;
        const level = currentLevel(LEVELS, completions);
        setSummary(parentSummary({ level, mastery, attempts, playedDates, now: Date.now() }));
      })();
      return () => {
        cancelled = true;
        setUnlocked(false);
        setSummary(null);
      };
    }, [progress, profileId, unlocked]),
  );

  if (ready && selected === null) return <Redirect href="/" />;
  if (!selected) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={styles.centered}>
        <View style={styles.gate}>
          <PinGate
            pin={pin}
            reason="To open the grown-ups' pages"
            onUnlocked={() => {
              markUnlocked();
              setUnlocked(true);
            }}
            onCancel={() => router.replace('/island')}
          />
        </View>
      </View>
    );
  }

  if (!summary) {
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
        <Text style={styles.title}>{selected.name}</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <Text accessibilityRole="header" style={styles.headline}>{summary.headline}</Text>

          <SyncCard status={sync} onSignIn={() => router.push('/signin')} onSyncNow={() => void syncNow()} />

          {summary.needsAHand.raised ? (
            <View accessible accessibilityRole="summary" style={styles.helpCard}>
              <Text style={styles.helpHeading}>A grown-up beside them will help most</Text>
              <Text style={styles.helpBody}>{summary.needsAHand.message}</Text>
            </View>
          ) : null}

          {!summary.started ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                Nothing to show yet. Once {selected.name} has played a quest, you will see here which sounds they know,
                what they mix up, and what to try together.
              </Text>
            </View>
          ) : null}

          <Section title="The sounds" note="Hearing: the sound is played and they find the letter. Seeing: the letter is shown and they know its sound.">
            <View style={styles.soundHeader}>
              <View style={styles.letterCol} />
              <Text style={[styles.colTitle, styles.chipCol]}>Hearing</Text>
              <Text style={[styles.colTitle, styles.chipCol]}>Seeing</Text>
            </View>
            {summary.sounds.map((row) => (
              <View
                key={row.grapheme.id}
                accessible
                accessibilityLabel={`${row.grapheme.id}: hearing, ${row.hearing.label}. Seeing, ${row.seeing.label}.`}
                style={styles.soundRow}
              >
                <View style={styles.letterCol}>
                  <Text style={styles.letter}>{row.grapheme.id}</Text>
                  <Text style={styles.mnemonic}>{row.grapheme.mnemonic}</Text>
                </View>
                <Chip state={row.hearing.state} label={row.hearing.label} />
                <Chip state={row.seeing.state} label={row.seeing.label} />
              </View>
            ))}
          </Section>

          {summary.started ? (
            <>
              <Section title="What they are mixing up">
                {summary.confusions.length === 0 ? (
                  <Text style={styles.body}>Nothing is being mixed up at the moment.</Text>
                ) : (
                  summary.confusions.map((c) => (
                    <View key={`${c.target}>${c.mistakenFor}`} style={styles.mixRow}>
                      <Text style={styles.mixLetters}>{c.target}  {c.mistakenFor}</Text>
                      <Text style={styles.bodyFlex}>{c.description}</Text>
                    </View>
                  ))
                )}
              </Section>

              <Section title="Try this">
                {summary.practice.length === 0 ? (
                  <Text style={styles.body}>Nothing in particular to practise right now. More quests together will do.</Text>
                ) : (
                  summary.practice.map((p) => (
                    <View key={`${p.kind}:${p.about}`} style={styles.tryCard}>
                      <Text accessibilityLabel={`Words to try: ${p.words.join(' and ')}`} style={styles.tryWords}>
                        {p.words.join('   ')}
                      </Text>
                      <Text style={styles.tryText}>{p.text}</Text>
                    </View>
                  ))
                )}
              </Section>
            </>
          ) : null}

          <Text style={styles.counts}>
            Quests played {summary.counts.sessionsPlayed}  ·  Days played {summary.counts.daysPlayed}  ·  Sounds known{' '}
            {summary.counts.soundsSecure} of {summary.counts.soundsTotal}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Where sync is shown, and the only place a sync problem is ever shown. A child
 * never sees any of this. Quiet by design: the game is fully playable whatever
 * it says.
 */
function SyncCard(props: { status: SyncStatus; onSignIn: () => void; onSyncNow: () => void }) {
  const { status } = props;
  if (status.kind === 'unavailable') return null;

  if (status.kind === 'signed-out') {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Keep their progress safe</Text>
        <Text style={styles.body}>
          Signing in keeps progress safe if this device is lost, and lets you see it from your phone. It is optional.
        </Text>
        <Pressable accessibilityRole="button" onPress={props.onSignIn} style={styles.syncButton}>
          <Text style={styles.syncButtonText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const line = status.syncing
    ? 'Saving…'
    : status.lastPassIncomplete
      ? 'Could not finish saving just now. Nothing is lost, and it will try again.'
      : status.lastSyncedAt !== null
        ? 'Progress is saved online.'
        : 'Signed in.';
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Keep their progress safe</Text>
      <Text style={styles.body}>
        {status.email ? `${status.email}. ` : ''}
        {line}
      </Text>
      <View style={styles.syncRow}>
        <Pressable accessibilityRole="button" onPress={props.onSyncNow} disabled={status.syncing} style={styles.syncButton}>
          <Text style={styles.syncButtonText}>Save now</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={props.onSignIn} style={[styles.syncButton, styles.syncButtonQuiet]}>
          <Text style={styles.syncButtonText}>Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section(props: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{props.title}</Text>
      {props.note ? <Text style={styles.note}>{props.note}</Text> : null}
      {props.children}
    </View>
  );
}

/** A colour and a word, never a bar: the word is the meaning and the colour is a help. */
const CHIP: Record<SoundState, { background: string; border: string }> = {
  secure: { background: tokens.color.correct, border: tokens.color.correct },
  learning: { background: tokens.color.hint, border: tokens.color.hint },
  'needs-refresh': { background: tokens.color.accent, border: tokens.color.accent },
  'not-started': { background: 'transparent', border: tokens.color.tileEdge },
};

function Chip(props: { state: SoundState; label: string }) {
  const look = CHIP[props.state];
  return (
    <View
      style={[
        styles.chip,
        styles.chipCol,
        { backgroundColor: look.background, borderColor: look.border },
        props.state === 'not-started' && styles.chipEmpty,
      ]}
    >
      <Text style={styles.chipText}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.paper, padding: tokens.space.md },
  gate: { width: '100%', maxWidth: 520, backgroundColor: tokens.color.tile, borderRadius: tokens.radius.lg, padding: tokens.space.lg },
  screen: { flex: 1, backgroundColor: tokens.color.paper, padding: tokens.space.md },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink },
  topSpacer: { width: 80 },
  content: { alignItems: 'center', paddingBottom: tokens.space.xl },
  column: { width: '100%', maxWidth: 720, gap: tokens.space.lg },
  headline: { fontFamily: tokens.font.ui, fontSize: tokens.type.body + 4, color: tokens.color.inkSoft, textAlign: 'center' },

  helpCard: {
    backgroundColor: tokens.color.hint,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    borderBottomWidth: 6,
    borderBottomColor: tokens.color.gold,
  },
  helpHeading: { fontFamily: tokens.font.ui, fontSize: tokens.type.title - 4, color: tokens.color.ink },
  helpBody: { fontFamily: tokens.font.ui, fontSize: tokens.type.body + 2, lineHeight: 28, color: tokens.color.ink },

  card: { backgroundColor: tokens.color.tile, borderRadius: tokens.radius.lg, padding: tokens.space.lg },
  syncRow: { flexDirection: 'row', gap: tokens.space.sm, marginTop: tokens.space.sm },
  syncButton: {
    minHeight: tokens.tap.min,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    paddingHorizontal: tokens.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: tokens.space.sm,
  },
  syncButtonQuiet: { backgroundColor: 'transparent', borderWidth: 2, borderColor: tokens.color.tileEdge },
  syncButtonText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent },
  section: { gap: tokens.space.sm },
  sectionTitle: { fontFamily: tokens.font.ui, fontSize: tokens.type.title - 6, color: tokens.color.ink },
  note: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  body: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, lineHeight: 26, color: tokens.color.ink },
  bodyFlex: { flex: 1, fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },

  soundHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  colTitle: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft, textAlign: 'center' },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.md,
    padding: tokens.space.sm,
  },
  letterCol: { width: 92, alignItems: 'center' },
  letter: { fontFamily: tokens.font.letter, fontSize: 40, color: tokens.color.ink, lineHeight: 48 },
  mnemonic: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption - 2, color: tokens.color.inkSoft },
  chipCol: { flex: 1 },
  chip: {
    minHeight: tokens.tap.min,
    borderRadius: tokens.radius.pill,
    borderWidth: 2,
    paddingHorizontal: tokens.space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipEmpty: { borderStyle: 'dashed' },
  chipText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption + 1, color: tokens.color.ink, textAlign: 'center' },

  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  mixLetters: { fontFamily: tokens.font.letter, fontSize: 32, color: tokens.color.ink, minWidth: 72 },

  tryCard: {
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    borderBottomWidth: 5,
    borderBottomColor: tokens.color.tileEdge,
  },
  tryWords: { fontFamily: tokens.font.letter, fontSize: tokens.type.word, color: tokens.color.ink },
  tryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body + 1, lineHeight: 28, color: tokens.color.ink },

  counts: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.caption,
    color: tokens.color.inkSoft,
    textAlign: 'center',
    marginTop: tokens.space.md,
  },
});
