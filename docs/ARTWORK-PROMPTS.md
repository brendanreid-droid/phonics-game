# Image-model prompts for the Soundlings artwork

Companion to [ARTWORK-BRIEF.md](ARTWORK-BRIEF.md), which is the specification.
This file is the same thing phrased for an image model.

**Read the brief's acceptance test first.** Every prompt below exists to satisfy
one sentence: *a five-year-old who has not been told the word says the word,
unprompted, within two seconds.* An image that is beautiful and gets named
wrong has failed.

## How to use this

1. Paste the **style preamble** at the top of every request. Consistency across
   42 assets is the thing image models are worst at, and repeating the preamble
   verbatim is the cheapest defence.
2. Generate **one asset per request**. Batching produces a sheet where no single
   image is usable at 56px.
3. Put the result through the naming test before generating the next in its set.
4. Drop the file into `apps/game/assets/words/` and wire it into
   `apps/game/src/art/wordPictures.tsx`, which already falls back to the emoji
   for anything not yet drawn.

**What these prompts cannot do.** The brief's hardest instructions are negative
— *"must not read as a dog"*, *"must not read as a chair"*. Diffusion models
handle negative semantic constraints badly, and you cannot iterate one toward
"and then the child says pat". Expect the simple objects (Part 2) to come out
well and the verbs (Part 1) to need several attempts or a person.

---

## Style preamble — prepend to every request

```text
Children's book illustration for a phonics reading app for five-year-olds.

STYLE: flat vector, hand-made paper-collage feel. Clean confident outlines in
warm dark brown (#3a3028) — never pure black. Soft muted palette, slightly
desaturated, like gouache on textured paper. Warm and gentle, never neon,
never glossy, never 3D-rendered, never corporate-flat-illustration.
Think a lovingly made paper toy, not an app icon.

PALETTE: warm dark brown outlines #3a3028, cream #fffdf8, warm paper #f6efe4,
blush #e8b4a0, gold #e2b23c, sage green #9ccfa4. Add other hues only where the
subject demands it (a red apple must be red), keeping the same muted value range.

COMPOSITION: one single subject, centred, square frame, transparent background.
No scene, no ground shadow, no frame, no border, no text, no letters, no
numbers anywhere in the image.

CRITICAL — SIZE: this is displayed at 56×56 pixels. It must be identifiable
from its SILHOUETTE alone. Bold simple shapes, thick outlines, high contrast,
no fine detail, no thin lines, no small elements, no texture that reads as
noise when shrunk.

AUDIENCE: a five-year-old must name this picture correctly with nobody
prompting them. That is the only measure of success.
```

---

## Part 1 — the words (hardest; verbs, do these with most care)

Each is followed by its **must not read as**, which is the actual constraint.
If the model will take a negative prompt, put that text there.

### sit

```text
A five-year-old child sitting on a low wooden stool, seen from the side in
profile. The child is the subject and fills the frame: back upright, thigh
horizontal, shin vertical — the clear right angle of sitting. Short dark curly
hair, round face, a yellow top. One hand resting on the knee. The stool is
drawn minimally, three thin lines, mostly hidden behind the child.
```
**Must not read as:** a chair · a stool · a standing child · furniture
**Note:** profile, not front-on. A seated child facing the viewer is a torso with
two knees pointing at the camera and reads as "person". The right angle is the word.

### sip

```text
A five-year-old child drinking through a straw. Head in three-quarter view on
the left, a cup held up on the right, and a thick straw running clearly
between them to the lips. Cheeks drawn in, eyes closed in concentration. Long
straight red hair in two plaits, a green top. The straw crosses empty space —
nothing overlaps it.
```
**Must not read as:** a cup · a drink · juice · a girl · the `sit` picture
**Note:** `sit` and `sip` differ by one sound and will appear side by side. Different
child, different pose, different dominant colour, every time.

### pat

```text
A large human hand reaching down and patting the head of a dog. The HAND is
the subject: large, centred, nearest the viewer, fingers spread downward,
filling the upper two thirds of the frame. The dog is small and incidental —
only the top of its head, one floppy ear and its muzzle, cropped by the bottom
edge of the frame, with no visible eyes or face. Two small curved motion lines
either side of the hand showing the patting movement.
```
**Must not read as:** a dog · a puppy · a hand alone · petting a cat
**Note:** the highest-risk asset in the game. The shipped version is a whole dog and
every child says "dog". If the hand cannot be made to dominate, we drop the word.

### pit

```text
A hole dug in sandy ground, seen at a slight angle from above so the far wall
inside the hole is visible. A heap of dug sand beside it with a spade standing
upright in the heap.
```
**Must not read as:** a hole in a wall · a cave · a tunnel · a well
**Note:** a child may simply say "hole". The spade and the heap are what make it a
dug pit. Test this one early.

### mat

```text
A woven doormat lying flat on the ground, seen from slightly above. Visible
woven texture and a short fringe along two edges. Completely empty — nothing
on it, nobody near it, no room around it.
```
**Must not read as:** a rug in a room · a yoga mat · a person · a carpet

### tap

```text
A garden tap seen from the side, with a single clear stream of water running
down from the spout. Brass or metal body, a cross-shaped handle on top.
```
**Must not read as:** a hose · a sink · a bath · a pipe
**Note:** Australian. A tap, not an American faucet. The water stream is what stops
it reading as a pipe.

### map

```text
An opened paper map held flat and filling the frame, with visible fold creases,
a simple coastline, and a dotted route line with a small red pin on it.
```
**Must not read as:** a globe · a phone · a treasure chest · a sheet of paper
**Note:** the one shipped picture children already name. Keep its reading; change
only the style.

### sam

```text
A five-year-old child, head and shoulders, front on, waving and smiling. Short
dark curly hair, round face, a yellow top.
```
**Must not read as:** a generic child · Pam
**Note:** must be the same child as the one in `sit`.

### pam

```text
A five-year-old child, head and shoulders, front on, waving and smiling. Long
straight red hair in two plaits, a green top.
```
**Must not read as:** a generic child · Sam
**Note:** must be the same child as the one in `sip`, and unmistakable from Sam at
56px — the plaits are the silhouette difference, not the face.

---

## Part 2 — start pictures (simple objects; these should come out well)

A game shows a letter and asks which picture **starts with that sound**. These
are the only assets where the first sound matters more than the picture: each
must be named with a word beginning with its own letter and no other.

| Prompt | Must not read as |
|---|---|
| `s` **sock** — A single woollen sock, ribbed cuff, lying slightly crumpled. | a shoe · a boot · a stocking |
| `s` **sun** — A round sun with short straight rays. | a star · a flower |
| `s` **sponge** — A rectangular kitchen sponge, one corner torn, visible pores, yellow with a green scouring side. | a cake · a brick · a biscuit |
| `a` **ant** — An ant seen from the side, three body segments, six legs, antennae. | a beetle · a spider · a caterpillar |
| `a` **ambulance** — An ambulance seen from the side, with a cross and a light bar. | a van · a truck · a bus |
| `t` **tree** — A broadleaf tree, visible trunk, rounded crown. | a bush · broccoli |
| `t` **train** — A steam train seen from the side, funnel and wheels, one carriage. | a bus · a tram |
| `t` **tooth** — A single molar with two roots, seen front on. | a cloud · a pillow · a blob |
| `p` **pen** — A capped ballpoint pen at a slight angle, with a clip. | a pencil · a marker · a stick |
| `p` **pizza** — A whole pizza from above, cut into slices, visible toppings. | a pie · a cake |
| `p` **potato** — A single brown potato with eyes and an irregular outline. | a rock · an egg · a bread roll |
| `m` **milk** — A tall glass of milk, full. | water · a glass · a jug |
| `m` **monkey** — A monkey, head and shoulders, front on, ears out. | a bear · a cat |
| `f` **fire** — A small campfire: three logs and flames. | a candle · the sun |
| `f` **feather** — A single feather at an angle, visible quill and barbs. | a leaf · a fern |
| `f` **flower** — A simple five-petal flower with a stem and two leaves. | a sun · a star |

`m` **map** reuses the `map` asset above. One picture, one meaning, everywhere.

> **`i` has no start pictures, deliberately.** No short-/i/ word renders
> unambiguously — "ice" and "iguana" begin with the long vowel and would teach
> the wrong sound. **Do not generate one.** Filling this gap with a
> close-enough picture is the exact error the brief exists to prevent.

---

## Part 3 — letter mnemonics

The first thing a child ever sees of a letter: shown large beside it on the
teaching card, and again as the first hint when they are stuck. Also each
creature's animal, so these and the creatures must look like one world.

| Prompt | Must not read as |
|---|---|
| `s` **snake** — A friendly snake curled into the shape of the letter S, head at the top. The curve of its body should read as an S without any letter beside it. | a worm · a rope · a dragon |
| `a` **apple** — A single red apple, front on, with a stalk and one green leaf. | a tomato · a cherry |
| `t` **teddy** — A teddy bear sitting, arms out, front on, with jointed limbs and a stitched muzzle. | a real bear · a dog |
| `p` **pig** — A pig front on, snout prominent, ears forward. | a dog · a cow |
| `m` **moon** — A crescent moon with a calm face, three-quarter view. | a banana · a star |
| `f` **fish** — A fish seen from the side, one visible eye, fanned tail. | a whale · a shark |

**`i` insect — discuss before generating.** The reliable picture is a
caterpillar, and a child shown a caterpillar says "caterpillar", which is not
"insect". The mnemonic *word* may need to change with the picture. Do not
quietly generate a beetle and call it solved.

---

## Checking what comes back

For each image, in this order:

1. **Shrink it to 56×56 and look at it there.** Not at full size. Most failures
   are invisible until you do this.
2. **Fill it solid black.** If you cannot tell what it is from the silhouette,
   it is not finished.
3. **Put it beside its minimal pair** — `sit` next to `sip`, `pat` next to
   `pit`, `map` next to `mat` — at 56px. The game deliberately shows these
   together. If they are confusable, one of them has to change.
4. **Show it to a five-year-old and say nothing.** Write down the first word
   they say. That is the result; everything above is just not wasting their time.
