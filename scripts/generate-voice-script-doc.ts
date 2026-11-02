#!/usr/bin/env node
/**
 * Writes docs/VOICE-SCRIPT.md from packages/audio/voice-script.txt.
 *
 * Generated rather than hand-written so the document a person records from
 * cannot drift from the clips the game actually plays. A recording session
 * costs money and happens once; a script that is missing a line, or that still
 * lists a clip deleted six weeks ago, is found out at the end of it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `.pathname`: the repository lives under a directory with
// a space in its name, and `.pathname` hands back %20.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'packages', 'audio', 'voice-script.txt');
const MANIFEST = join(ROOT, 'packages', 'audio', 'src', 'manifest.json');
const OUT = join(ROOT, 'docs', 'VOICE-SCRIPT.md');

/**
 * Which clips are already recorded, read out of the manifest.
 *
 * The pack arrives in sessions, and the second session should not re-record
 * the first. Before this, the script handed to a reader listed all 69 clips
 * whatever had already been done, so the only thing stopping a repeat was
 * somebody remembering.
 */
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
function isRecorded(key: string): boolean {
  const path = manifest[key];
  return typeof path === 'string' && !path.includes('/placeholder-');
}

interface Row {
  key: string;
  text: string;
  ipa: string;
  note: string;
}

const rows: Row[] = readFileSync(SOURCE, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  .map((line) => {
    const [key, text, ipa, , note] = line.split('|');
    return { key, text, ipa, note };
  });

const SECTIONS: { prefix: string; title: string; label: string; blurb: string }[] = [
  {
    prefix: 'ph.',
    label: 'sounds',
    title: 'The sounds',
    blurb:
      'These seven matter more than everything else here put together. Please read the ' +
      'two rules above again before recording them.',
  },
  {
    prefix: 'ln.',
    label: 'letter names',
    title: 'The letter names',
    blurb:
      'Ordinary letter names, said plainly. A child is never taught these in this level — ' +
      'they are for the grown-ups’ pages — which is exactly why they must not be ' +
      'confused with the sounds above.',
  },
  {
    prefix: 'wd.',
    label: 'words',
    title: 'The words',
    blurb:
      'Whole words at a natural pace. **Never sound a word out and never separate it into ' +
      'its parts.** Putting the sounds together is what the child is learning to do; hearing ' +
      'it done for them removes the task.',
  },
  {
    prefix: 'ui.',
    label: 'game lines',
    title: 'What the game says',
    blurb:
      'Warm, unhurried, as if sitting beside them. These play on every single task, so read ' +
      'them plainly enough that they still bear hearing on the fiftieth time.',
  },
  {
    prefix: 'praise.',
    label: 'praise',
    title: 'Praise',
    blurb:
      'Twelve of them so a child does not hear the same one twice in a row. Vary the energy ' +
      'between takes. None of them is shouted — this is a person pleased for them, not a ' +
      'crowd.',
  },
  {
    prefix: 'encourage.',
    label: 'encouragements',
    title: 'After a wrong answer',
    blurb:
      'A five-year-old reads tone long before words. **Not one of these may sound ' +
      'disappointed, surprised, or patient-in-a-strained-way.** Aim for the voice you would ' +
      'use if they had got it right and you simply fancied another go.',
  },
];

function table(section: { prefix: string }): string {
  // The key is the first column because the recording notes tell the reader to
  // name each file after it. A row number would be useless for that.
  // The phoneme table has three columns, not four: its spelling column is
  // deliberately absent (see below) and an empty one would just invite someone
  // to fill it back in.
  const sounds = section.prefix === 'ph.';
  const lines = sounds
    ? ['| File | Sound | How |', '|---|---|---|']
    : ['| File | Say | Sound (IPA) | How |', '|---|---|---|---|'];
  for (const row of rows) {
    if (!row.key.startsWith(section.prefix)) continue;
    // A phoneme row shows the SOUND and never the spelling. The spelling in
    // the source file exists only for the macOS stand-in, which cannot be
    // handed a phoneme and has to be given "tuh" for /t/ — and a person reading
    // "tuh" off this page would record exactly the defect the note beside it
    // forbids. The one column a reader's eye lands on must not contradict the
    // instruction next to it.
    // A tick, so a reader can see at a glance which rows are already done
    // rather than reading the outstanding list and cross-referencing.
    const file = isRecorded(row.key) ? `\`${row.key}\` ✓` : `\`${row.key}\``;
    if (sounds) {
      lines.push(`| ${file} | **/${row.ipa}/** | ${row.note} |`);
      continue;
    }
    lines.push(`| ${file} | ${row.text} | ${row.ipa ? `\`/${row.ipa}/\`` : '—'} | ${row.note} |`);
  }
  return lines.join('\n');
}

const counts = SECTIONS.map((s) => `${rows.filter((r) => r.key.startsWith(s.prefix)).length} ${s.label}`);

const outstanding = rows.filter((r) => !isRecorded(r.key));
const outstandingBySection = SECTIONS.map((section) => ({
  section,
  keys: outstanding.filter((r) => r.key.startsWith(section.prefix)).map((r) => r.key),
})).filter((group) => group.keys.length > 0);

const progress =
  outstanding.length === 0
    ? `**All ${rows.length} clips are recorded.** Nothing below needs doing again; the tables are kept as the record of how each one was asked for.`
    : [
        `**${rows.length - outstanding.length} of ${rows.length} clips are already recorded** and are ticked (✓) in the tables below.`,
        `**Please record only the ${outstanding.length} unticked clips.** Re-recording a ticked one is not harmful, but it is an hour nobody needs to spend, and a second take in a different room would be audible against the first.`,
        '',
        ...outstandingBySection.map(
          (group) => `- **${group.section.title}** — ${group.keys.length}: ${group.keys.map((k) => `\`${k}\``).join(', ')}`,
        ),
      ].join('\n');

const doc = `# Soundlings — recording script

> **Generated from \`packages/audio/voice-script.txt\` by \`scripts/generate-voice-script-doc.ts\`.**
> Do not edit this file; edit the source and regenerate, or the game will play
> clips nobody recorded.

**${rows.length} clips**: ${counts.join(', ')}. About an hour in a quiet room.

${progress}

## For whoever is reading

Thank you — this is for a reading game for five-year-olds who are meeting
letters for the first time, and the recording matters more than it looks.

**Australian English, please.** The teaching sequence is the Australian one and
the vowels differ; an American /a/ is a different sound from the one these
children are being taught.

Two rules govern the whole session. Everything else is detail.

**1. Say the sound, never the letter name.** The letter \`s\` says /sss/. It does
not say "ess". A child taught that \`s\` says "ess" cannot read \`sat\`, because
"ess-a-tee" is not a word. The letter names have their own section below and are
used nowhere near a child.

**2. Never add a vowel to a consonant.** This is the one people get wrong, and
it is nearly always invisible to the person doing it. /t/ is a tap of air. It is
**not** "tuh". /p/ is a puff. It is **not** "puh". If you record /t/ as "tuh"
and /p/ as "puh", a child sounding out \`tap\` hears **"tuh-a-puh"** and never
arrives at "tap" — which is the exact failure this whole game exists to prevent.

A useful test: say the sound, then say it again with your hand flat in front of
your mouth. If your jaw drops open at the end, you have added a vowel. Clip it.

Sounds that *can* be stretched — /sss/, /mmm/, /fff/ — should be held for about
two seconds. Sounds that cannot be stretched — /t/, /p/ — should be as short as
you can make them.

## Recording notes

- One clip per file, named with the **File** column of each table below, e.g.
  \`ph.s.wav\`, \`wd.sat.wav\`.
- Leave about half a second of silence at each end. \`scripts/import-voice-pack.sh\`
  trims it off, levels every clip to the same peak, and encodes the result —
  the clips play back-to-back with no gap of their own, so silence left in a
  file becomes a gap inside a word.
- Keep the mic position, level and room identical for every clip. These play
  back-to-back, and a jump in tone between two of them is audible.
- If you fluff one, say it again rather than editing — three clean takes of a
  short clip costs less than a repair.
- Mono, 44.1 kHz, WAV or AIFF. We convert.

${SECTIONS.map(
  (section) => `## ${section.title}\n\n${section.blurb}\n\n${table(section)}`,
).join('\n\n')}

## When it comes back

**Listen to all ${rows.filter((r) => r.key.startsWith('ph.')).length} sounds individually, not the pack as a whole.** Two were wrong in an
earlier pack and were found by acoustic analysis rather than by ear, because a
schwa on the end of /t/ is easy to miss in a run of clips and obvious when you
play that one clip twice.

For each one ask: is there a vowel on the end of it? Is this the sound, or is it
the letter's name? Would this blend?
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, doc);
console.log(`Wrote ${rows.length} clips to ${OUT}`);
