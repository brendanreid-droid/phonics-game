# Review gate: playable Level 1, with the shell around it

**Built:** Plan 1 (tasks 1–29), Plan 2 (tasks 1–10) and Plan 3 (tasks 1–8).
**Tests:** 1,345 passing across 59 files.

## New in Plan 3: a second way to prove each skill

The game now has **seven mini-games**, not four. The point is the anti-memorisation guarantee: a child cannot be marked as knowing a sound, a word to read or a word to spell by learning one game's answer pattern, because mastery now needs two *different* games.

- **Word Pick** (reading). A picture, and three *written words* to choose from. It runs the opposite way to Picture Match, and its wrong words share the right word's first letter (`mat` against `map`), so matching the first letter and guessing does not work: the child has to read to the end. The word is never spoken.
- **Missing Letter** (spelling). Hear "mat", see `m _ t`, tap the missing letter. It asks for the **vowel in the middle** about 70% of the time. Word Builder lets a child reach the vowel by elimination, placing the two consonants they are sure of until the vowel drops into the last gap without ever being chosen; this game removes that escape. Only the letter the child chose counts as evidence for that sound, not the letters they were shown.
- **Picture Start** (letter to sound). See a letter, hear its sound, tap which of three pictures *starts* with it. The right picture is **never the letter's own mnemonic** (`m`'s is the moon, so the answer is milk or a monkey), and no card on screen is any letter's mnemonic. Otherwise a child could answer from the picture they were taught beside the sound, which is the memorisation this exists to rule out. The pictures are chosen for this game, not borrowed from the words: a child *names* the picture here, so a muscle cannot stand for `fit`.

**Six of the seven sounds can be proved two ways. `i` cannot.** No short-/i/ initial emoji is unambiguous: insect is the mnemonic, ice and iguana begin with the long vowel and would teach the wrong sound, igloo draws as a hut, and ink draws as a pen (which is `p`'s answer). So `i` keeps Sound Singer as its one proving game, stated rather than hidden. Real artwork, or a voice task (`SAY_IT`), is what lifts it.

**Pacing went up, on purpose.** Asking for two independent proofs costs more than one. A strong learner now needs about 17 quests, up from about 15; the others barely moved. See the table below.

---

## New in Plan 2 — the shell

The game now belongs to a child rather than to a hard-coded id.

- **Profile picker.** A row of faces; tap yours. No passwords, no typing, nothing to forget. A grown-up types the name once.
- **The island.** Home screen and progress map in one: seven creature slots in teaching order, hatched friends against eggs. The gaps are the point — a child can see there are seven friends and exactly which they have yet to meet. The Play button says **"Keep going"** when a quest was interrupted.
- **Level select.** Completion is read from a **latch**, not the live calculation, so a finished level stays finished even after memory decays and a single wrong answer un-masters a sound.
- **Trophy room.** Achievements only — no error count, no accuracy, nothing readable as a mark against them. Unearned trophies show as *Not yet* rather than `0`, because a five-year-old reads a nought as a nought whatever the label says.
- **Streaks** count local calendar days, not 24-hour periods: 7pm Monday then 8am Tuesday is two days running. A broken streak is never shown.
- **Deleting a profile deletes that child's record** — mastery, attempts, confusions, sessions, scores, everything. The dialog promises it, so it has to be true.

Creating and deleting a profile need a two-second hold; choosing one does not. The hold is beyond an idle five-year-old's patience and trivial for an adult who means it. The PIN arrives with the parent area in Plan 4; two different gates would be worse than one.

---

## Try it in 30 seconds

```bash
cd "apps/game" && npm run web
```

Open **http://localhost:8081** and press Play.

That is the fastest path, and it is a real build of the real game — same engine, same curriculum, same audio. It is not an iPad, which matters (see *What the browser cannot tell you*).

## Try it properly, on a device

No Xcode is installed on this machine, so there is no iOS simulator. You do not need one:

1. Install **Expo Go** (free, App Store) on your iPad
2. `cd "apps/game" && npx expo start`
3. Scan the QR code

Real touch, real speakers, real screen size. This is the one that counts for a children's app — a five-year-old's game should be judged with a finger, not a mouse pointer.

---

## What to try

1. **Make a profile.** The add sheet opens by itself the first time. Note that "Hold to add" genuinely needs holding — a tap does nothing, deliberately.
2. **Tap your face** to land on the island.
3. **Play a full quest.** Fourteen tasks, about five minutes.
4. **Play far enough to meet all seven mini-games.** This is the most important new thing to try. Sound Hunt, Sound Singer and Picture Start arrive on day one. **Picture Match, Word Pick, Word Builder and Missing Letter need words, so they arrive several quests in**, once a few sounds are known: until then a child is asked about sounds only. Picture Match in particular has been built and tested since Plan 1 and **nobody has ever seen it running**. Play on until all seven have come up, and judge each one by looking: are the pictures recognisable, do the three written words in Word Pick read at a glance, does the gap in Missing Letter read as a gap.
2. **Get something wrong on purpose, twice on the same letter.** Watch the hint ladder: the owl nudges, the mnemonic appears, the choices narrow, and finally the answer is revealed for you to tap. You stay on the task throughout — the game does not move you past something you have not learnt.
3. **Do nothing for ten seconds.** The ladder escalates on idling too, but never as far as revealing the answer. A child who pauses is thinking, and handing them the answer steals a win they were about to earn.
4. **Reload the page mid-quest.** You resume on the same task, with the same plan. Progress is written after every single task.
5. **Play four or five quests** to see a creature hatch.

## What to listen for

**This is the thing nobody has been able to check.** Neither I nor any agent on this project can hear audio, and audio is the game — every task is a sound.

- `s` must say **"sss"**, not "ess". A letter *name* where a letter *sound* belongs is the single most common way phonics software gets it wrong, and it actively teaches a child something false.
- `a` must be the short /a/ of **cat**, not the long "ah" of *father*. This one was wrong and was fixed by cutting the vowel out of the word "at"; it has been verified by formant analysis but never by a human ear.
- `i` must be the short /i/ of **sit**. This was previously the letter name "eye" — exactly the error above — and was caught late.
- `m` must be **"mmm"**, not "em".

If any of those are wrong, the fix is in `scripts/generate-placeholder-audio.sh`.

---

## What is deliberately not here

- **The voice is a placeholder** generated by macOS `say`. Fine for judging the game, **not fine for a real child**. A human voice pack is a prerequisite for child testing — see spec §9.3 for costs and the recommended hybrid approach.
- **Pictures are emoji** standing in for illustration. Picture Start's pictures were chosen to be named unambiguously, but they are still emoji and still need the real-artwork test (can a five-year-old name each one unprompted?). The *word* pictures used by Picture Match and Word Pick are survivable when ambiguous, because the child reads the word; the mat (a person doing yoga) and fit (a muscle) are the weakest.
- **No parent area** — Plan 4. That is where the honest diagnostic picture lives: the per-sound heatmap, the confusion pairs, and the "needs a hand" signal for a child answering near chance.
- **No backend.** Progress is on-device, per profile. Supabase and cross-device sync are Plan 4.
- **Only Level 1.** Levels 2–6 are Plan 5. The second mini-game per skill is done (Plan 3), except for `i`'s letter-to-sound, which has only one.
- **No voice recognition.** The `SAY_IT` skill exists in the type system; nothing implements it.

## What the browser cannot tell you

- **Touch.** Tap targets are sized for a five-year-old's finger on an 11-inch iPad. A mouse pointer proves nothing about that.
- **Audio behaviour.** Browsers block sound until the first tap, and iOS has its own rules about the silent switch. Only a device shows the truth.
- **Orientation.** The landscape lock and full-screen requirement apply to a native build only. A browser window can be any shape.

---

## What to judge

The visible game is the smaller half. The adaptive engine is the differentiator, and it is mostly invisible in a single quest — it shows up as *what you are asked next*, and why.

Two places where it is legible:

```bash
npx vitest run packages/engine          # the invariants, in plain language
npx vitest run packages/engine/src/simulate.test.ts   # pacing for four kinds of learner, now with seven mini-games
```

Measured pacing, 30 simulated children per profile, one quest per day:

| Learner | Quests to finish Level 1 |
|---|---|
| Strong (95% accuracy) | 11–22, mean 17 |
| Average (80%) | 14–37, mean 22 |
| Struggling (70%) | 13–64, mean 31 |
| Near-chance (55%) | 1 of 30 finish within 40 |

A child who completes Level 1 can read `sat, pat, tip, mat, fit, map` — cold, a day later, unaided. That is the claim, and it is the one worth checking against a real five-year-old.

## Known limits, stated plainly

- **We do not claim fewer tasks than the 40-game competitor.** An earlier version of the spec did; simulation showed it was false and it was withdrawn.
- **The mastery gate is statistical, not absolute.** A child answering at chance will eventually pass it given enough attempts — measured at about 72 quests. The real safeguard is telling the grown-up, which is a Plan 2 feature and is required, not optional.
- **`growthFactor: 4` is measured, not principled.** It implies two months' retention from three correct answers. It produced the best pacing in a grid search; it deserves checking against real children.
- **Nobody has heard the audio.** See above.
