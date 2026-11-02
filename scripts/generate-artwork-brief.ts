#!/usr/bin/env node
/**
 * Writes docs/ARTWORK-BRIEF.md from packages/curriculum/artwork-brief.txt,
 * joined to the curriculum itself.
 *
 * Generated rather than hand-written for the same reason the voice script is
 * (scripts/generate-voice-script-doc.ts): the document someone draws from must
 * not be able to drift from the assets the game actually asks for. A brief that
 * omits a picture the engine needs, or commissions one it will never show, is
 * found out after the money is spent.
 *
 * It FAILS rather than warns when the two disagree. The only tolerated
 * differences are the ones stated explicitly in the source file: `+word` for a
 * picture being commissioned before the curriculum has it, and `-word` for one
 * the curriculum has and we are deliberately retiring.
 *
 * The minimal-pair sets in the output are COMPUTED, not listed by hand. They
 * are the hardest constraint on this sheet and the easiest to get wrong by
 * omission.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CREATURE_LIST,
  GRAPHEME_LIST,
  PICTURABLE_WORD_LIST,
  WORD_LIST,
  getWord,
} from '../packages/curriculum/src/index.ts';

// fileURLToPath, not `.pathname`: the repository lives under a directory with
// a space in its name, and `.pathname` hands back %20.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'packages', 'curriculum', 'artwork-brief.txt');
const OUT = join(ROOT, 'docs', 'ARTWORK-BRIEF.md');

interface Row {
  kind: string;
  id: string;
  draw: string;
  not: string;
  note: string;
}

const lines = readFileSync(SOURCE, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

const rows: Row[] = [];
const planned: string[] = [];
const retiring: { id: string; why: string }[] = [];

for (const line of lines) {
  const parts = line.split('|');
  if (line.startsWith('+word|')) {
    planned.push(parts[1]);
    continue;
  }
  if (line.startsWith('-word|')) {
    retiring.push({ id: parts[1], why: parts[2] ?? '' });
    continue;
  }
  const [kind, id, draw, not, note] = parts;
  rows.push({ kind, id, draw, not: not ?? '', note: note ?? '' });
}

const of = (kind: string) => rows.filter((r) => r.kind === kind);

// --- the checks that make this worth generating -----------------------------

const problems: string[] = [];
const briefedWords = new Set(of('word').map((r) => r.id));
const plannedWords = new Set(planned);
const retiringWords = new Set(retiring.map((r) => r.id));

for (const word of PICTURABLE_WORD_LIST) {
  if (!briefedWords.has(word.id) && !retiringWords.has(word.id)) {
    problems.push(`word "${word.id}" has a picture in the curriculum but no line in the brief`);
  }
}
for (const id of briefedWords) {
  const known = WORD_LIST.some((w) => w.id === id);
  if (!known) problems.push(`the brief draws word "${id}", which is not a Level 1 word at all`);
  else if (!PICTURABLE_WORD_LIST.some((w) => w.id === id) && !plannedWords.has(id)) {
    problems.push(`the brief draws word "${id}", which has no picture in the curriculum and is not listed as planned`);
  }
}
for (const id of plannedWords) {
  if (!briefedWords.has(id)) problems.push(`"${id}" is planned but has no line to draw from`);
}
for (const { id } of retiring) {
  if (!PICTURABLE_WORD_LIST.some((w) => w.id === id)) {
    problems.push(`"${id}" is listed as retiring but already has no picture — delete the line`);
  }
}

const briefedMnemonics = new Set(of('mnemonic').map((r) => r.id));
for (const g of GRAPHEME_LIST) {
  if (!briefedMnemonics.has(g.id)) problems.push(`grapheme "${g.id}" has no mnemonic line`);
}
const briefedStarts = new Set(of('start').map((r) => r.id));
for (const g of GRAPHEME_LIST) {
  for (const picture of g.startPictures) {
    const key = `${g.id}:${picture.label}`;
    if (!briefedStarts.has(key)) problems.push(`start picture "${key}" has no line`);
  }
}
for (const key of briefedStarts) {
  const [graphemeId, label] = key.split(':');
  const grapheme = GRAPHEME_LIST.find((g) => g.id === graphemeId);
  if (!grapheme) problems.push(`start picture "${key}" names an unknown letter`);
  else if (!grapheme.startPictures.some((p) => p.label === label)) {
    problems.push(`start picture "${key}" is not one of "${graphemeId}"'s start pictures`);
  }
}
const briefedCreatures = new Set(of('creature').map((r) => r.id));
for (const c of CREATURE_LIST) {
  if (!briefedCreatures.has(c.id)) problems.push(`creature "${c.id}" has no line`);
}

// The count the engine depends on, checked against the brief rather than
// against what happens to be in the curriculum today.
const afterBrief = PICTURABLE_WORD_LIST.filter((w) => !retiringWords.has(w.id)).length + planned.length;
const MIN_PICTURABLE = 8;
if (afterBrief < MIN_PICTURABLE) {
  problems.push(
    `this brief leaves ${afterBrief} picturable words; the engine needs at least ${MIN_PICTURABLE} ` +
      `(integrity.test.ts), and the oral blending quota is drawn from them`,
  );
}

if (problems.length > 0) {
  console.error('The brief and the curriculum disagree:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nFix the source file or the curriculum. Nothing was written.');
  process.exit(1);
}

// --- minimal pairs: the hardest constraint, computed ------------------------

/**
 * Words of the same length differing in exactly one sound.
 *
 * These are what the distractor picker deliberately puts on screen together —
 * near neighbours are ranked FIRST, so a child cannot win by matching one sound
 * — which means two pictures from the same set are side by side regularly. The
 * words are as close as words get; the pictures have to be as far apart as
 * pictures get.
 */
function minimalPairsOf(id: string): string[] {
  const target = getWord(id).graphemes;
  return WORD_LIST.filter((other) => {
    if (other.id === id) return false;
    if (other.graphemes.length !== target.length) return false;
    let differences = 0;
    for (let i = 0; i < target.length; i += 1) if (other.graphemes[i] !== target[i]) differences += 1;
    return differences === 1;
  }).map((w) => w.text);
}

/** Only the pairs that will actually be drawn, which is what the illustrator can act on. */
function drawnPairsOf(id: string): string[] {
  const drawn = new Set([...briefedWords].map((w) => getWord(w).text));
  return minimalPairsOf(id).filter((text) => drawn.has(text));
}

const table = (section: Row[], extra?: (row: Row) => string) =>
  [
    `| Asset | Draw | Must not read as | ${extra ? 'Also on screen with | ' : ''}Note |`,
    `|---|---|---|${extra ? '---|' : ''}---|`,
    ...section.map(
      (r) =>
        `| \`${r.id}\` | ${r.draw} | ${r.not === '—' ? '—' : `**${r.not}**`} | ` +
        `${extra ? `${extra(r)} | ` : ''}${r.note || '—'} |`,
    ),
  ].join('\n');

const doc = `# Soundlings — illustration brief

> **Generated from \`packages/curriculum/artwork-brief.txt\` by \`scripts/generate-artwork-brief.ts\`.**
> Do not edit this file; edit the source and regenerate. The generator refuses to
> run if the brief and the game disagree about which pictures exist.

**${of('word').length} word pictures, ${of('mnemonic').length} letter mnemonics, ${of('start').length} start pictures, ${of('creature').length} creatures, ${of('cast').length} characters.**

## The one test everything has to pass

> **Show the picture to a five-year-old who has not been told the word. Within two seconds, with nobody prompting them, they say the word.**

If they say anything else, the picture has failed, however beautiful it is. This is not a style note — it is the entire specification, and it is the test we will run on delivery.

**Why it is this strict.** The first game a child ever plays, Robot Talk, has **no letters and no words on screen at all**. A robot says /p/-/a/-/t/, sound by sound, and the child taps a picture. That is how we find out whether they can blend sounds into a word — the single strongest predictor of whether a child learns to read. If the picture needs explaining, the game stops measuring blending and starts measuring whether the child happens to share our idea of what a dog photo means.

Seven of the nine pictures in the game today fail this test. A child shown the current \`pat\` says "dog". That is what this brief exists to fix.

## The hardest constraint: minimal pairs

The words a child confuses are the ones that differ by a single sound, so the game **deliberately puts those on screen together** — otherwise a child could win by hearing only the first sound. The "Also on screen with" column below is computed from the word list, not chosen by hand.

**Two pictures from the same set will sit side by side, at 56 pixels, for a child who is listening rather than reading.** The words are as close as words get. The pictures have to be as far apart as pictures get: different subject, different silhouette, different dominant colour. Do not solve this with detail — at this size there is no detail.

## Technical

| | |
|---|---|
| Rendered size | **56 × 56 pt** inside a 112 pt tile. Design at this size, not scaled down from large. |
| Format | SVG preferred. Otherwise PNG at 3×, 168 × 168, transparent. |
| Shape | Square, centred, with a little air. No frame, no background, no drop shadow. |
| Ground | Sits on \`#fffdf8\` (near-white tile) and must also hold up on \`#f6efe4\` (warm paper). |
| Silhouette | **Fill it solid black at 56 px. If it is not recognisable, it is not finished.** A child identifies a small picture by its outline before anything else. |
| Text | **None, ever.** They cannot read yet — that is the point of the product. |
| Palette | Warm and muted, below. Not the saturated primaries every competitor uses. |

### Palette

| | | |
|---|---|---|
| Ink | \`#3a3028\` | Outlines and the darkest value. Never pure black. |
| Paper | \`#f6efe4\` | The page behind everything. |
| Tile | \`#fffdf8\` | What these sit on. |
| Accent | \`#e8b4a0\` | Warm blush. Creature cheeks, highlights. |
| Gold | \`#e2b23c\` | Reward and warmth. |
| Green | \`#9ccfa4\` | |
| Hint | \`#f3d9a6\` | |

Use these as the family. Add hues where a picture needs them — a red apple has to be red — but keep the value range and the softness. The house style is "a lovingly made paper toy", not "an app".

**Never red for anything that means wrong or bad.** A five-year-old reads red as being told off, and this game is built so that being wrong feels safe.

### Australian English

The sequence, the vowels and the vocabulary are Australian. A \`tap\` is a tap, not a faucet.

## The words

${table(of('word'), (r) => (drawnPairsOf(r.id).length > 0 ? drawnPairsOf(r.id).map((w) => `\`${w}\``).join(' ') : '—'))}

### Words that will not be pictured, and why

These stay in the game — a child still reads and spells them — but they lose their picture and leave the two picture games. **Please do not try to solve these.** They were looked at and they do not have an answer.

${retiring.map((r) => `- **\`${r.id}\`** — ${r.why}`).join('\n')}

## The letters

A letter's mnemonic is the first thing a child ever sees of it: the Meet card shows the letter large, says its sound, and shows this picture beside it. The same picture comes back as the first hint when they are stuck. It is also the creature's animal, so the mnemonics and the creatures must look like one world.

${table(of('mnemonic'))}

### Start pictures

Picture Start shows a letter and asks which picture **starts with that sound**. These are the only assets where the first sound matters more than the picture: each must be named with a word beginning with its own letter and nothing else.

${table(of('start'))}

> \`i\` has no start pictures and that is deliberate. No short-/i/ word renders unambiguously — "ice" and "iguana" start with the long vowel and would teach the wrong sound. **Do not invent one.**

## The creatures

Seven Soundlings, one per sound, earned when that sound is mastered. On the island they are eggs until they hatch.

Their names begin with their own sound — Sisi, Momo, Fifi — so that a child saying the name rehearses the sound they just learned. **The reward is the lesson**, not a sticker bolted onto it. Each creature is its letter's mnemonic animal given a character, and the two must be recognisably the same creature.

${table(of('creature'))}

Also needed per creature: an **egg** (same palette, a hint of the creature's colour) and a **hatching** pose.

## The cast

${table(of('cast'))}

Sam and Pam are the two children in the word list. Giving them faces is what makes \`sit\` and \`sip\` drawable at all: an object alone becomes its own name — a chair is always "chair" — so the action needs someone performing it.

**This only works if a child meets them first.** They should appear on the island, not arrive cold inside a question.

## Delivering

1. **Three first, for the test**: \`sit\`, \`sip\` and \`pat\`. They are the riskiest, and if the approach fails it fails there. We run them past real five-year-olds before the rest is drawn.
2. Then the letters — mnemonics and start pictures — which are the most used assets in the game.
3. Then the remaining words, the creatures, the eggs.

Send SVG where you can. Name each file after the \`Asset\` column: \`word-sit.svg\`, \`mnemonic-s.svg\`, \`start-s-sock.svg\`, \`creature-sisi.svg\`.

**Nothing is finished until a child who has never seen it names it.** We will test every picture that way and we will come back on the ones that fail — it is not a judgement on the drawing, it is the only measure that matters for a child who cannot yet read the word.
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, doc);
console.log(
  `Wrote ${rows.length} assets to ${OUT} ` +
    `(${afterBrief} picturable words after this brief, floor is ${MIN_PICTURABLE})`,
);
