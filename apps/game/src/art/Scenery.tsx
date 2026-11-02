import { StyleSheet, View } from 'react-native';
import { Circle, Defs, Ellipse, G, LinearGradient, Path, Pattern, Rect, Stop, Svg } from 'react-native-svg';
import { tokens } from '@soundlings/ui';

/**
 * The island itself, and the paper it is printed on.
 *
 * The home screen was called "the island" for months and was a row of dashed
 * boxes on a flat fill. A five-year-old is told they are collecting friends on
 * an island; the screen should be one.
 *
 * ## Why it is this quiet
 *
 * Everything here is deliberately low-contrast and kept to the Soft Paper
 * values. The scenery is **behind** the creature slots and the Play button,
 * which are the only things a child must be able to find, so it may not compete
 * with them. A saturated cartoon island would be prettier in a screenshot and
 * worse in use — the eye would land on the palm trees rather than on the eggs.
 *
 * Judge it by squinting: the slots and the button should still be the first two
 * things you see.
 */

const SEA = '#cfe0e8';
const SEA_DEEP = '#b4cedb';
const SAND = '#ecdcbc';
const SAND_LIT = '#f4ead3';
const GRASS = '#cfe0c4';
const TRUNK = '#c2a07c';
const FROND = '#a8c9ad';

/**
 * Paper grain.
 *
 * A tiled pattern of faint flecks rather than a turbulence filter: SVG filters
 * are unevenly supported on native, and a pattern of circles renders the same
 * everywhere and costs nothing. It is what stops the ground reading as a hex
 * value and starts it reading as paper.
 *
 * Very low opacity on purpose. If you can see the flecks as flecks, it is too
 * strong — it should only register when you look away.
 */
export function PaperGrain() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="grain" width={24} height={24} patternUnits="userSpaceOnUse">
            <Circle cx={3} cy={5} r={0.9} fill={tokens.color.ink} opacity={0.05} />
            <Circle cx={15} cy={2} r={0.7} fill={tokens.color.ink} opacity={0.04} />
            <Circle cx={9} cy={14} r={1} fill={tokens.color.ink} opacity={0.045} />
            <Circle cx={20} cy={11} r={0.6} fill={tokens.color.ink} opacity={0.04} />
            <Circle cx={6} cy={20} r={0.8} fill={tokens.color.ink} opacity={0.05} />
            <Circle cx={18} cy={21} r={0.7} fill={tokens.color.ink} opacity={0.035} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#grain)" />
      </Svg>
    </View>
  );
}

/**
 * The working surface: a warm gradient and a pool of light, nothing else.
 *
 * Used behind the mini-games, where the island would be actively harmful. A
 * child on these screens is decoding, and the letters and pictures ARE the
 * content — the same logic the illustration brief applies to a picture at 56pt
 * applies to the whole screen. Palm trees here would be something for the eye
 * to go to instead of the work.
 *
 * So this does one thing: lifts the centre slightly so the task sits in light
 * and the edges fall away. It should be almost impossible to notice, and the
 * screen should feel warmer than a flat fill without anyone being able to say
 * why.
 */
export function SoftBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#faf5ec" />
            <Stop offset="0.55" stopColor={tokens.color.paper} />
            <Stop offset="1" stopColor="#f1e8da" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#warm)" />
      </Svg>
    </View>
  );
}

/** One palm. Three fronds and a leaning trunk is all a palm needs at this size. */
function Palm({ x, y, scale = 1, flip }: { x: number; y: number; scale?: number; flip?: boolean }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <Path d="M0 0 C-2 -14 -1 -24 3 -34" stroke={TRUNK} strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path d="M3 -34 C-6 -42 -16 -41 -20 -34 C-12 -36 -7 -34 3 -31 Z" fill={FROND} />
      <Path d="M3 -34 C3 -45 11 -51 19 -50 C12 -46 9 -41 6 -32 Z" fill={FROND} />
      <Path d="M3 -34 C13 -39 23 -35 25 -28 C18 -31 11 -31 4 -30 Z" fill={FROND} />
      <Circle cx={3} cy={-34} r={2.6} fill={TRUNK} />
    </G>
  );
}

/**
 * The backdrop. Absolutely positioned, behind everything, and not interactive.
 *
 * `slice` rather than `meet`: the scene fills whatever shape the screen is and
 * is allowed to crop. Nothing in it is load-bearing, so losing the edge of the
 * sea on a narrow phone costs nothing, whereas letterboxing would show bare
 * paper down the sides.
 */
export function IslandScene() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#faf4ea" />
            <Stop offset="1" stopColor={tokens.color.paper} />
          </LinearGradient>
          <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SEA} />
            <Stop offset="1" stopColor={SEA_DEEP} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={400} height={300} fill="url(#sky)" />

        {/* Clouds: two soft shapes, high, well away from the content. */}
        <G opacity={0.65}>
          <Ellipse cx={72} cy={38} rx={26} ry={11} fill={tokens.color.tile} />
          <Ellipse cx={92} cy={32} rx={18} ry={13} fill={tokens.color.tile} />
          <Ellipse cx={316} cy={54} rx={22} ry={9} fill={tokens.color.tile} />
          <Ellipse cx={298} cy={49} rx={15} ry={11} fill={tokens.color.tile} />
        </G>

        {/* Sea, with a far shore so the horizon is not a hard line. */}
        <Path d="M0 196 L400 196 L400 300 L0 300 Z" fill="url(#water)" />
        <Path d="M0 196 C60 190 120 199 180 194 C240 189 320 198 400 193 L400 206 L0 206 Z" fill={SEA} opacity={0.55} />

        {/* Wave marks. Sparse: a busy sea is a distracting sea. */}
        <G stroke={tokens.color.tile} strokeWidth={2.4} strokeLinecap="round" opacity={0.5} fill="none">
          <Path d="M34 232 C42 227 50 237 58 232" />
          <Path d="M286 222 C294 217 302 227 310 222" />
          <Path d="M150 262 C158 257 166 267 174 262" />
          <Path d="M330 268 C338 263 346 273 354 268" />
        </G>

        {/* The island: a sand shelf, a grass cap, and palms at the EDGES.
            Raised clear of the bottom so water shows beneath it — at the first
            attempt the land ran off the bottom of the screen and read as a
            beach you were standing on rather than an island you were visiting.

            Nothing is drawn across the centre. A palm was, and the Play button
            landed on top of it, leaving a bare trunk sticking out below like a
            rendering fault. The middle of this screen belongs to the child's
            friends and the button; the scenery stays at the edges. */}
        <Ellipse cx={200} cy={227} rx={176} ry={44} fill={SAND} />
        <Ellipse cx={200} cy={220} rx={168} ry={40} fill={SAND_LIT} />
        {/* Closed with a curve back along the sand, not a straight line. A `Z`
            on its own drew a hard horizontal edge across the island that read
            as a seam between two layers. */}
        <Path
          d="M54 216 C84 187 150 178 200 178 C250 178 316 187 346 216 C300 231 100 231 54 216 Z"
          fill={GRASS}
        />
        <Palm x={78} y={212} scale={1} />
        <Palm x={332} y={215} scale={0.92} flip />
        {/* Two small rocks, to break the sand's edge without filling it. */}
        <Ellipse cx={128} cy={243} rx={7} ry={4} fill={SAND} opacity={0.9} />
        <Ellipse cx={272} cy={247} rx={9} ry={5} fill={SAND} opacity={0.9} />
      </Svg>
    </View>
  );
}

/**
 * A star, drawn.
 *
 * The results screen used the `★` glyph at 64pt. A glyph is somebody else's
 * drawing: it renders differently on every platform, it cannot be given a
 * highlight, and an "empty" one is the same shape in a paler colour rather than
 * a shape that reads as not-yet-earned. This is the same reasoning that took
 * the creatures off emoji.
 */
export function StarArt({ size = 64, earned }: { size?: number; earned: boolean }) {
  const POINTS =
    'M32 5 L40 23 L60 26 L46 40 L49 59 L32 50 L15 59 L18 40 L4 26 L24 23 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d={POINTS}
        fill={earned ? tokens.color.gold : 'none'}
        stroke={earned ? '#c4952c' : tokens.color.line}
        strokeWidth={earned ? 2 : 3}
        strokeLinejoin="round"
      />
      {/* A highlight on the upper-left face, so an earned star has a surface.
          An unearned one is an empty outline: not the same shape in a paler
          colour, but visibly a space where a star is not yet. */}
      {earned && <Path d="M32 11 L37 24 L26 27 Z" fill={tokens.color.tile} opacity={0.35} />}
    </Svg>
  );
}
