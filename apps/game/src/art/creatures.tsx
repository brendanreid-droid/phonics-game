import { Circle, Ellipse, G, Path, Svg } from 'react-native-svg';
import { tokens } from '@soundlings/ui';
import { CREATURE_COLOURS as COLOURS } from './palette';
import type { CreatureId } from './palette';

/**
 * The seven Soundlings, drawn rather than borrowed from the emoji font.
 *
 * These are the reward AND the mnemonic: Sisi is the snake that `s` is drawn
 * as, Momo is the moon that `m` stands for. A child who says "Sisi" rehearses
 * /s/, which is why the names were chosen that way. Emoji could not carry that
 * — 🐍 is somebody else's snake, it looks different on every platform, and it
 * cannot be given an egg, a hatching pose or a blush.
 *
 * ## The rules these are drawn to
 *
 * **Silhouette first.** Each is rendered at 56pt inside a 112pt tile, and a
 * child identifies a small picture by its outline before anything else. Every
 * creature here is recognisable filled solid black at that size; none relies on
 * interior detail. `creatures-preview.tsx` renders exactly that test.
 *
 * **One dominant hue each**, so two creatures side by side are never confused.
 * The palette is the Soft Paper family (muted, warm, paper-like) with one
 * deliberate exception: Fifi is blue. A warm fish would have collided with
 * Popo's pink and Annie's red, and distinguishability beats palette purity when
 * the viewer is five.
 *
 * **Tito and Popo were the hard pair.** Both began as a round head with two
 * ears and were near-identical in silhouette. Tito is now a whole seated figure
 * with arms; Popo is a head whose snout breaks the circle. Round ears versus
 * pointed ones would not have been enough at 56pt.
 *
 * Coordinates are a 64-unit square. Keep them: the shapes were tuned by looking
 * at them at the real size, not by scaling a large drawing down.
 */

const INK = tokens.color.ink;
const BLUSH = tokens.color.accent;

const STROKE = 2.5;

/** Two eyes, the same everywhere, so the whole set reads as one hand. */
function Eyes({ x, y, gap = 10, r = 2.6 }: { x: number; y: number; gap?: number; r?: number }) {
  return (
    <G>
      <Circle cx={x - gap / 2} cy={y} r={r} fill={INK} />
      <Circle cx={x + gap / 2} cy={y} r={r} fill={INK} />
    </G>
  );
}

/** A cheek. Always on the creature's left, so the set has one light source. */
function Blush({ x, y }: { x: number; y: number }) {
  return <Ellipse cx={x} cy={y} rx={4} ry={2.6} fill={BLUSH} opacity={0.75} />;
}

interface Drawn {
  /** True while the silhouette test is being run: everything renders solid ink. */
  flat?: boolean;
}

function fillOf(colour: string, flat?: boolean): string {
  return flat ? INK : colour;
}

function Sisi({ flat }: Drawn) {
  const body = fillOf(COLOURS.sisi, flat);
  return (
    <G>
      {/* The letter `s` itself, as a thick stroked path. Sisi IS the letterform. */}
      <Path
        d="M43 21 C43 13 23 13 23 21 C23 29 43 31 43 40 C43 49 25 50 21 43"
        stroke={body}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M43 21 C43 13 23 13 23 21 C23 29 43 31 43 40 C43 49 25 50 21 43"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
        opacity={flat ? 0 : 0.25}
      />
      <Circle cx={43} cy={19} r={7.5} fill={body} stroke={INK} strokeWidth={STROKE} />
      {!flat && <Eyes x={44} y={18} gap={6} r={1.8} />}
      {!flat && <Blush x={38} y={23} />}
    </G>
  );
}

function Annie({ flat }: Drawn) {
  const body = fillOf(COLOURS.annie, flat);
  return (
    <G>
      {/* Drawn in the silhouette too. An apple without its stalk and leaf is a
          round blob, indistinguishable from Popo's head at 40pt — the first
          run of the silhouette sheet showed exactly that, because these two
          were decoration that `flat` threw away. The test is only worth
          anything if the drawing cannot opt out of it. */}
      <Path d="M32 18 C33 12 33 9 33 7" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path
        d="M34 11 C40 6 47 8 46 13 C45 17 38 17 34 11 Z"
        fill={flat ? INK : '#8fae7a'}
        stroke={flat ? 'none' : INK}
        strokeWidth={STROKE}
      />
      <Path
        d="M32 19 C22 12 10 20 12 33 C14 47 23 57 32 52 C41 57 50 47 52 33 C54 20 42 12 32 19 Z"
        fill={body}
        stroke={flat ? 'none' : INK}
        strokeWidth={STROKE}
      />
      {!flat && <Eyes x={32} y={32} gap={12} />}
      {!flat && <Path d="M28 40 C30 43 34 43 36 40" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
      {!flat && <Blush x={21} y={38} />}
    </G>
  );
}

function Tito({ flat }: Drawn) {
  const body = fillOf(COLOURS.tito, flat);
  const line = flat ? 'none' : INK;
  return (
    <G>
      {/* A whole seated figure, not a head: this is what separates Tito from
          Popo at 56pt, where round ears and pointed ears look the same. */}
      <Circle cx={17} cy={17} r={7.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={47} cy={17} r={7.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Ellipse cx={32} cy={46} rx={15} ry={13} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={13} cy={45} r={6.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={51} cy={45} r={6.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={32} cy={26} r={16} fill={body} stroke={line} strokeWidth={STROKE} />
      {!flat && <Ellipse cx={32} cy={31} rx={8} ry={6} fill={tokens.color.tile} opacity={0.85} />}
      {!flat && <Ellipse cx={32} cy={28.5} rx={2.6} ry={2} fill={INK} />}
      {!flat && <Eyes x={32} y={22} gap={12} />}
      {!flat && <Blush x={19} y={29} />}
    </G>
  );
}

function Popo({ flat }: Drawn) {
  const body = fillOf(COLOURS.popo, flat);
  const line = flat ? 'none' : INK;
  return (
    <G>
      {/* Pointed ears, and a snout that breaks the head's circle. The broken
          outline is the whole silhouette difference from Tito. */}
      <Path d="M17 22 L14 6 L29 13 Z" fill={body} stroke={line} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M47 22 L50 6 L35 13 Z" fill={body} stroke={line} strokeWidth={STROKE} strokeLinejoin="round" />
      <Circle cx={32} cy={33} r={18} fill={body} stroke={line} strokeWidth={STROKE} />
      <Ellipse cx={32} cy={41} rx={11.5} ry={8.5} fill={body} stroke={line} strokeWidth={STROKE} />
      {!flat && <Circle cx={28} cy={41} r={1.9} fill={INK} />}
      {!flat && <Circle cx={36} cy={41} r={1.9} fill={INK} />}
      {!flat && <Eyes x={32} y={27} gap={14} />}
      {!flat && <Blush x={17} y={34} />}
    </G>
  );
}

function Indi({ flat }: Drawn) {
  const body = fillOf(COLOURS.indi, flat);
  const line = flat ? 'none' : INK;
  return (
    <G>
      {!flat && <Path d="M46 20 L50 9" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />}
      {!flat && <Path d="M40 20 L36 10" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />}
      {!flat && <Circle cx={50.5} cy={8} r={2.4} fill={INK} />}
      {!flat && <Circle cx={35.5} cy={9} r={2.4} fill={INK} />}
      {/* Segments, smallest tail to biggest head. The bumpy edge is the
          silhouette, so the overlap must stay shallow. */}
      <Circle cx={12} cy={44} r={7} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={23} cy={41} r={8.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={34} cy={37} r={9.5} fill={body} stroke={line} strokeWidth={STROKE} />
      <Circle cx={45} cy={31} r={11} fill={body} stroke={line} strokeWidth={STROKE} />
      {!flat && <Eyes x={46} y={29} gap={9} r={2.3} />}
      {!flat && <Path d="M42 36 C44 38 48 38 50 36" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />}
      {!flat && <Blush x={38} y={34} />}
    </G>
  );
}

function Momo({ flat }: Drawn) {
  const body = fillOf(COLOURS.momo, flat);
  return (
    <G>
      {/* A crescent is the most distinctive outline in the set — nothing else
          here has a concave side — so Momo needs no interior detail at all.
          Which made it the worst of the seven to get wrong, and it was: the
          first version set large-arc on the inner sweep, which sent it the long
          way round so the two arcs enclosed nothing and Momo rendered as an
          empty outline. The inner arc must be large-arc 0, sweep 1, with a
          radius LARGER than the outer one — that shallower return curve is what
          makes the concave edge. */}
      <Path
        d="M38 7 A25 25 0 1 0 38 57 A30 30 0 0 1 38 7 Z"
        fill={body}
        stroke={flat ? 'none' : INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {!flat && <Eyes x={24} y={28} gap={11} />}
      {!flat && <Path d="M20 37 C22 40 26 40 28 37" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
      {!flat && <Blush x={14} y={35} />}
    </G>
  );
}

function Fifi({ flat }: Drawn) {
  const body = fillOf(COLOURS.fifi, flat);
  const line = flat ? 'none' : INK;
  return (
    <G>
      <Path d="M42 32 L59 19 L59 45 Z" fill={body} stroke={line} strokeWidth={STROKE} strokeLinejoin="round" />
      <Ellipse cx={27} cy={32} rx={19} ry={14} fill={body} stroke={line} strokeWidth={STROKE} />
      {!flat && <Path d="M24 18 L32 23 L22 25 Z" fill={body} stroke={INK} strokeWidth={2} strokeLinejoin="round" />}
      {!flat && <Circle cx={18} cy={29} r={2.8} fill={INK} />}
      {!flat && <Path d="M12 36 C15 38 19 38 21 36" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />}
      {!flat && <Blush x={15} y={37} />}
    </G>
  );
}

const DRAWINGS: Record<CreatureId, (props: Drawn) => React.JSX.Element> = {
  sisi: Sisi,
  annie: Annie,
  tito: Tito,
  popo: Popo,
  indi: Indi,
  momo: Momo,
  fifi: Fifi,
};

export type { CreatureId } from './palette';

export interface CreatureArtProps {
  id: CreatureId;
  /** Rendered edge length in points. The shapes were tuned at 56. */
  size?: number;
  /**
   * Renders the creature as a solid ink silhouette.
   *
   * This is the acceptance test from the illustration brief, applied to our own
   * drawings: a picture a child cannot identify from its outline alone is not
   * finished. It is wired into a screen rather than left as a one-off check so
   * that it keeps being true.
   */
  flat?: boolean;
}

export function CreatureArt({ id, size = 56, flat }: CreatureArtProps) {
  const Drawing = DRAWINGS[id];
  if (!Drawing) throw new Error(`No drawing for creature: ${id}`);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Drawing flat={flat} />
    </Svg>
  );
}

export interface EggArtProps {
  /** Which creature is inside. Tints the egg, so the island hints at what is coming. */
  id: CreatureId;
  size?: number;
  /** Mid-hatch: the shell cracked, the creature showing through. */
  hatching?: boolean;
}

/**
 * An unhatched creature.
 *
 * Eggs rather than blanks because the island is the progress bar: a child
 * should see there are seven friends and which they have yet to meet. The tint
 * is the creature's own colour at low opacity — enough to make the eggs
 * distinguishable from each other, not enough to give the creature away.
 */
export function EggArt({ id, size = 56, hatching }: EggArtProps) {
  const tint = COLOURS[id];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* Opacity 0.5 and a 0.8 outline, not the 0.28/0.55 this started at.
          On the island, against warm paper and inside a dashed slot, the first
          version read as a faint placeholder rather than an object: a thing the
          screen had failed to load, not a friend waiting to be earned. An egg a
          child is working towards has to look like it is there. */}
      <Path
        d="M32 5 C19 5 11 24 11 37 C11 49 20 59 32 59 C44 59 53 49 53 37 C53 24 45 5 32 5 Z"
        fill={tint}
        opacity={0.5}
      />
      {/* A highlight, so it reads as a rounded object rather than a flat oval. */}
      <Ellipse cx={25} cy={22} rx={5} ry={7} fill={tokens.color.tile} opacity={0.5} />
      <Path
        d="M32 5 C19 5 11 24 11 37 C11 49 20 59 32 59 C44 59 53 49 53 37 C53 24 45 5 32 5 Z"
        fill="none"
        stroke={INK}
        strokeWidth={STROKE}
        opacity={0.8}
      />
      {/* Speckles, so an egg reads as an egg rather than as a blank oval. */}
      <Ellipse cx={24} cy={32} rx={3} ry={2.2} fill={INK} opacity={0.2} />
      <Ellipse cx={39} cy={35} rx={2.4} ry={1.8} fill={INK} opacity={0.2} />
      <Ellipse cx={28} cy={45} rx={2.8} ry={2} fill={INK} opacity={0.2} />
      {hatching && (
        <Path
          d="M11 34 L18 29 L25 35 L32 28 L39 35 L46 29 L53 34"
          fill="none"
          stroke={INK}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
