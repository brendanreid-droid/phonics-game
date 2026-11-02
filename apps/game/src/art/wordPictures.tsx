import { Circle, Ellipse, G, Path, Rect, Svg } from 'react-native-svg';
import { tokens } from '@soundlings/ui';
import type { WordId } from '@soundlings/curriculum';

/**
 * Word pictures, for the four words worth testing before any are commissioned.
 *
 * ## These are not the artwork. They are the experiment.
 *
 * docs/ARTWORK-BRIEF.md asks an illustrator for `sit`, `sip` and `pat` first,
 * because those three carry the whole risk: they are verbs, and **an object
 * drawn alone becomes its own name** — a chair is "chair", never "sit". The
 * proposed answer is to make the ACTION the subject and the object incidental,
 * with Sam and Pam as the people performing it.
 *
 * That proposal is worth money only if it works on a real five-year-old, and
 * nobody should spend the money to find out. So these are drawn here, roughly,
 * to make the test runnable now.
 *
 * **What a result means.** A child naming these says the APPROACH works and an
 * illustrator need only make it beautiful. A child failing to name them is
 * ambiguous — it could be the idea or it could be my drawing — so a failure
 * sends us back to the concept, not straight to a commission.
 *
 * `map` is here as the control. It is the one shipped emoji a child already
 * names correctly, and an object rather than an action, so it isolates craft
 * from concept: if a child names my `map` but not my `sit`, the drawing is
 * adequate and the idea is the problem.
 *
 * Every other word still renders its emoji (see `WordPicture` below). A mixed
 * state is exactly how the real artwork will arrive, one asset at a time.
 */

const INK = tokens.color.ink;
const STROKE = 2.5;

/** Sam: dark curly hair, a yellow top. Pam: red plaits, a green top. */
const SAM_HAIR = '#4a3a2e';
const SAM_TOP = '#e2b23c';
const PAM_HAIR = '#c4603f';
const PAM_TOP = '#8fae7a';
const SKIN = '#e8c9a8';

interface Drawn {
  flat?: boolean;
}

const ink = (colour: string, flat?: boolean) => (flat ? INK : colour);
const line = (flat?: boolean) => (flat ? 'none' : INK);

/**
 * Sam, seated, in profile.
 *
 * Profile and not front-on, deliberately: a seated figure facing the viewer is
 * a torso with two knees pointing at the camera, which reads as "person". The
 * right angle of a profile — back vertical, thigh horizontal, shin vertical —
 * is what the word "sitting" looks like, and it survives being shrunk to 56px
 * and filled solid black.
 *
 * The stool is three thin lines and is drawn UNDER the figure, mostly hidden.
 * It is there so the pose has a reason, not to be looked at; the moment a
 * child can see a nice chair, the answer is "chair".
 */
function Sit({ flat }: Drawn) {
  return (
    <G>
      {!flat && (
        <G>
          <Rect x={16} y={45} width={22} height={3.5} rx={1.5} fill="#c8b49a" />
          <Path d="M20 48 L19 58 M34 48 L35 58" stroke="#c8b49a" strokeWidth={3} strokeLinecap="round" />
        </G>
      )}
      {/* Thigh, then shin: the right angle is the word. */}
      <Path d="M27 41 L43 41" stroke={ink(SAM_TOP, flat)} strokeWidth={12} strokeLinecap="round" />
      <Path d="M43 42 L43 54" stroke={ink(SKIN, flat)} strokeWidth={10} strokeLinecap="round" />
      <Path d="M43 56 L50 56" stroke={ink(INK, flat)} strokeWidth={5} strokeLinecap="round" />
      <Path d="M26 24 L26 42" stroke={ink(SAM_TOP, flat)} strokeWidth={14} strokeLinecap="round" />
      {/* The arm rests on the thigh, which only a seated person's does. */}
      <Path d="M30 30 L38 39" stroke={ink(SAM_TOP, flat)} strokeWidth={7} strokeLinecap="round" />
      <Circle cx={26} cy={15} r={9} fill={ink(SKIN, flat)} stroke={line(flat)} strokeWidth={STROKE} />
      <Path
        d="M17 13 C17 4 35 4 35 13 C35 10 31 8 26 8 C21 8 17 10 17 13 Z"
        fill={ink(SAM_HAIR, flat)}
        stroke={line(flat)}
        strokeWidth={flat ? 0 : 1.5}
      />
      {!flat && <Circle cx={30} cy={15} r={1.8} fill={INK} />}
      {!flat && <Path d="M29 19 C31 21 33 20 34 18" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />}
    </G>
  );
}

/**
 * Pam, drinking through a straw.
 *
 * The straw at the lips is the entire picture. A cup drawn on its own is
 * "cup"; a cup held near a face is "drink". The thing that makes it `sip` is
 * the line running from cup to mouth and the cheeks drawn in — so the straw is
 * thick enough to survive 56px and crosses the face rather than sitting beside
 * it.
 *
 * Standing, head turned, cup held high: all three differ from `sit` on
 * purpose. The two will appear side by side, because they differ by one sound.
 */
function Sip({ flat }: Drawn) {
  return (
    <G>
      {/* Head left, cup right, straw a clear diagonal between them. The first
          version put the cup under the right plait and the straw across the
          face: at 56pt the three collided into one shape and the picture read
          as "girl". The straw has to cross EMPTY space to be seen as a straw. */}
      <Path d="M24 34 L24 54" stroke={ink(PAM_TOP, flat)} strokeWidth={15} strokeLinecap="round" />
      <Circle cx={23} cy={22} r={12} fill={ink(SKIN, flat)} stroke={line(flat)} strokeWidth={STROKE} />
      {/* Plaits — the silhouette difference from Sam. Both kept left of the cup. */}
      <Path d="M12 19 L9 35" stroke={ink(PAM_HAIR, flat)} strokeWidth={7} strokeLinecap="round" />
      <Path d="M34 19 L36 31" stroke={ink(PAM_HAIR, flat)} strokeWidth={7} strokeLinecap="round" />
      <Path
        d="M11 20 C11 7 35 7 35 20 C35 14 30 11 23 11 C16 11 11 14 11 20 Z"
        fill={ink(PAM_HAIR, flat)}
        stroke={line(flat)}
        strokeWidth={flat ? 0 : 1.5}
      />
      <Path
        d="M44 34 L58 34 L55 56 L47 56 Z"
        fill={ink('#dbe6ef', flat)}
        stroke={line(flat)}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M51 33 L31 24" stroke={ink('#d9705e', flat)} strokeWidth={5} strokeLinecap="round" />
      {!flat && <Circle cx={19} cy={21} r={1.9} fill={INK} />}
      {/* Cheeks drawn in: the mouth is a small pucker at the straw, not a smile. */}
      {!flat && <Ellipse cx={29} cy={25} rx={2.6} ry={2.2} fill={INK} opacity={0.8} />}
      {!flat && <Ellipse cx={15} cy={27} rx={3.5} ry={2.4} fill={tokens.color.accent} opacity={0.7} />}
    </G>
  );
}

/**
 * A hand patting a dog.
 *
 * **The highest-risk picture in the game.** The shipped emoji is a whole dog
 * and every child says "dog", so the entire design here is about stopping that:
 * the hand is enormous, centred and nearest the viewer; the dog is small, cut
 * off by the bottom edge, and given no face to look at. A dog you cannot see
 * the eyes of is scenery.
 *
 * The motion arcs above the hand are doing real work — they turn a hand
 * resting on a dog into a hand moving on a dog, which is the difference
 * between "dog" and "pat".
 *
 * If a child still says "dog", the brief says to drop the word rather than
 * ship it, and this drawing is how we find that out cheaply.
 */
function Pat({ flat }: Drawn) {
  return (
    <G>
      {/* Dog: a back and an ear at the bottom edge, no face. */}
      <Path
        d="M8 62 C8 48 20 42 32 42 C44 42 56 48 56 62 Z"
        fill={ink('#c8a47e', flat)}
        stroke={line(flat)}
        strokeWidth={STROKE}
      />
      {/* One floppy ear and a muzzle. Without them the dog is a brown hill and
          the picture reads as "hand"; with a face it reads as "dog". An ear
          says "animal" without giving the child anything to look at. */}
      <Path d="M13 47 C5 45 3 56 9 60 C12 56 13 51 13 47 Z" fill={ink('#b8906a', flat)} stroke={line(flat)} strokeWidth={flat ? 0 : 2} />
      <Path d="M51 50 C58 50 60 56 58 62 L48 62 Z" fill={ink('#b8906a', flat)} stroke={line(flat)} strokeWidth={flat ? 0 : 2} />
      {/* Hand: large, fingers down, nearest the viewer. */}
      <Path
        d="M20 10 L20 34 C20 42 44 42 44 34 L44 14 C44 10 40 10 40 14 L40 24 L40 10 C40 6 36 6 36 10 L36 24 L36 8 C36 4 32 4 32 8 L32 24 L32 10 C32 6 28 6 28 10 L28 26 L26 18 C25 14 20 15 20 19 Z"
        fill={ink(SKIN, flat)}
        stroke={line(flat)}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* Movement, which is what makes it a pat rather than a hand on a dog. */}
      {!flat && (
        <G>
          <Path d="M12 18 C9 21 9 27 12 30" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
          <Path d="M52 18 C55 21 55 27 52 30" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </G>
      )}
    </G>
  );
}

/**
 * The control.
 *
 * An opened map: the one shipped picture a child already names correctly, and
 * an object rather than an action. It is drawn to the same standard as the
 * three above so that a test can tell a bad drawing from a bad idea.
 */
function Map({ flat }: Drawn) {
  return (
    <G>
      <Path
        d="M6 16 L23 10 L41 17 L58 11 L58 50 L41 56 L23 49 L6 55 Z"
        fill={ink('#f0e4cb', flat)}
        stroke={line(flat)}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* The folds are what make it a map rather than a sheet of paper. */}
      {!flat && <Path d="M23 10 L23 49 M41 17 L41 56" stroke={INK} strokeWidth={1.8} opacity={0.45} />}
      {!flat && (
        <Path
          d="M10 40 C16 34 18 44 26 38 C33 33 34 42 42 37 C48 33 52 36 55 33"
          stroke="#9ccfa4"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* A dotted route and a pin: the two things a child points at on a map. */}
      {!flat && (
        <Path
          d="M14 24 L20 22 M26 21 L32 24 M38 25 L44 22"
          stroke={INK}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.65}
        />
      )}
      {!flat && <Circle cx={48} cy={21} r={3.4} fill="#d9705e" stroke={INK} strokeWidth={1.6} />}
    </G>
  );
}

/**
 * The cast, head and shoulders, waving.
 *
 * These two are not optional extras. `pip` and `fit` left Robot Talk because no
 * drawing of them is ever named "pip" or "fit" — and the engine needs a floor
 * of eight picturable words, so two had to arrive before those two could go.
 *
 * They are also the only two words in the game that are picturable with no
 * emoji behind them. No emoji means "Sam" rather than "a child", so these are
 * drawn or they are nothing.
 *
 * **The hair is the picture.** A child meets Sam inside `sit` and Pam inside
 * `sip`, and the job here is that the same person is recognisable alone. Faces
 * do not survive 56pt; silhouettes do. So Sam's curls break the top edge of his
 * head and Pam's plaits hang past her shoulders, and both are drawn in flat
 * mode — the silhouette test is worthless if the drawing opts out of it, which
 * is exactly how Annie once became an indistinguishable blob.
 */
function Waver({
  flat,
  hair,
  top,
  plaits,
}: Drawn & { hair: string; top: string; plaits?: boolean }) {
  return (
    <G>
      {/* The waving arm goes down first, so the shoulder covers where it joins
          and the arm reads as coming from behind the body rather than being
          stuck on. Bare skin, not a sleeve: at 56pt a sleeve the colour of the
          top merges into it and the hand is left floating on its own. */}
      <Path d="M40 50 L52 34" stroke={ink(SKIN, flat)} strokeWidth={10} strokeLinecap="round" />
      {/* The hand is deliberately much smaller than the head and overlaps the
          end of the arm. Drawn as a circle the same size and colour as the
          head, with a gap, it read as a second head floating beside the
          first. */}
      <Circle cx={54} cy={31} r={5.5} fill={ink(SKIN, flat)} stroke={line(flat)} strokeWidth={flat ? 0 : 2} />
      <Path
        d="M9 64 C9 47 15 39 28 39 C41 39 47 47 47 64 Z"
        fill={ink(top, flat)}
        stroke={line(flat)}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={28} cy={26} r={14} fill={ink(SKIN, flat)} stroke={line(flat)} strokeWidth={STROKE} />
      {plaits ? (
        <Path
          d="M14 25 C14 10 42 10 42 25 C42 18 37 14 28 14 C19 14 14 18 14 25 Z"
          fill={ink(hair, flat)}
          stroke={line(flat)}
          strokeWidth={flat ? 0 : 1.5}
        />
      ) : (
        // Curls cut INTO the top edge rather than drawn on top of it, so they
        // are part of the outline and survive being filled solid.
        <Path
          d="M14 25 C13 17 17 10 21 13 C22 7 27 7 28 12 C30 7 36 8 36 13 C41 10 43 17 42 25 C42 18 37 14 28 14 C19 14 14 18 14 25 Z"
          fill={ink(hair, flat)}
          stroke={line(flat)}
          strokeWidth={flat ? 0 : 1.5}
        />
      )}
      {/* Pam's plaits hang in FRONT of her shoulders, drawn last so nothing can
          cover them. Behind the head, where they started, they were inside her
          own silhouette and invisible — she read as Sam, which is the one
          thing these two pictures may not do.
          They start tucked under the head and flare out past the shoulder, so
          the silhouette is broken at the bottom where there is room for it.
          Each is a filled shape ANCHORED INSIDE THE HEAD rather than a line
          beside it. As strokes they left a wedge of background enclosed
          between plait, neck and shoulder — at 56pt that reads as a hole in
          the drawing, not as hair. Starting them within the head circle means
          no gap can open however the head or shoulders are moved. */}
      {plaits ? (
        <G>
          <Path
            d="M20 31 C10 38 3 50 4 63 C10 64 18 60 19 48 C20 41 23 35 25 32 Z"
            fill={ink(hair, flat)}
            stroke={line(flat)}
            strokeWidth={flat ? 0 : 1.5}
          />
          <Path
            d="M36 31 C46 38 53 50 52 63 C46 64 38 60 37 48 C36 41 33 35 31 32 Z"
            fill={ink(hair, flat)}
            stroke={line(flat)}
            strokeWidth={flat ? 0 : 1.5}
          />
        </G>
      ) : null}
      {!flat && <Circle cx={22} cy={27} r={2} fill={INK} />}
      {!flat && <Circle cx={34} cy={27} r={2} fill={INK} />}
      {!flat && (
        <Path d="M22 34 C25 38 31 38 34 34" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
      )}
    </G>
  );
}

const Sam = ({ flat }: Drawn) => <Waver flat={flat} hair={SAM_HAIR} top={SAM_TOP} />;
const Pam = ({ flat }: Drawn) => <Waver flat={flat} hair={PAM_HAIR} top={PAM_TOP} plaits />;

const DRAWINGS: Partial<Record<WordId, (props: Drawn) => React.JSX.Element>> = {
  sit: Sit,
  sip: Sip,
  pat: Pat,
  map: Map,
  sam: Sam,
  pam: Pam,
};

/** The words that have a drawing. Everything else still falls back to its emoji. */
export const DRAWN_WORDS = Object.keys(DRAWINGS) as WordId[];

export function hasWordPicture(id: WordId): boolean {
  return DRAWINGS[id] !== undefined;
}

export interface WordPictureArtProps {
  id: WordId;
  size?: number;
  /** Solid ink. The silhouette test from the brief, applied to our own work. */
  flat?: boolean;
}

export function WordPictureArt({ id, size = 56, flat }: WordPictureArtProps) {
  const Drawing = DRAWINGS[id];
  if (!Drawing) throw new Error(`No drawing for word: ${id}. Check hasWordPicture first.`);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Drawing flat={flat} />
    </Svg>
  );
}
