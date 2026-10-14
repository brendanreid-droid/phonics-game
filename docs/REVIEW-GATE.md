# Review gate: playable Level 1, with the shell around it

**Built:** Plan 1 (tasks 1–29), Plan 2 (tasks 1–10), Plan 3 (tasks 1–8), Plan 4 (the parent area) and Plan 5 (Supabase and sync).
**Tests:** 1,787 passing across 81 files.

## New in Plan 5: progress that survives a lost device

**Signing in is optional, and the game is fully playable without it.** Nothing waits on it, nothing nags, and an app built without a Supabase project configured runs exactly as before. To turn it on: from the island open **Grown-ups**, enter the PIN, and tap **Sign in** on the card at the top. A grown-up enters an email address and follows the emailed link (or types the code, if the email carries one). There is no password. The screen says what it is for: keeping progress safe if the device is lost, and seeing it from a phone.

**What syncs, and what deliberately does not.**

| Syncs | Derived on each device from the log |
|---|---|
| child profiles (a first name and an avatar id, nothing else) | mastery |
| the attempt log, append-only | streaks and played dates |
| the level-completion latch | high scores and stars |
| | creatures |

Why: an append-only log merges as a set union, so two devices that both played offline both contribute and nothing has to win. Derived data cannot drift from its source: a synced mastery row written by an old app version against a newer algorithm would be silently wrong, and the algorithm has already changed twice. The completion latch is stored rather than derived because a child must never lose a level they finished, and recomputing it would bring back the decay problem the latch exists to defeat (spec §5.7).

**The active mid-quest session is deliberately not synced.** Two devices resuming the same half-finished quest is a conflict with no good resolution, and nobody asked for it. An interrupted quest resumes on the device it started on.

**The two rules it holds.** The network is never between a child's tap and the game responding: every read and write goes to local storage as before, a quest makes no network call at all, and sync runs afterwards (on sign-in, on coming to the foreground, a moment after a quest finishes). A failed sync never loses local work: what it could not push stays pending, a deletion it could not complete is retried, and it never shows an error to a child. A sync problem appears only on the Grown-ups page.

**What was checked, and what was not.**

- The test the design rests on passes. Whole quests played through `buildSession` and `recordTaskResult`, and through the real `QuestRunner`, rebuild from their attempt log to a mastery map equal to the live one. 16 simulated children, including slips, shown answers and abandoned tasks, and when the log arrives jumbled or with repeats.
- Eighteen integration tests run real quests over the sync against an in-memory server that can be switched off: a second device arriving with the child, two devices that both played offline, deletion on one device, a refused attempt, a connection that dies mid-sync, a quest on screen when a pull lands.
- The server's policies were exercised again with the exact statements the client sends, as a real `authenticated` role in a transaction that was rolled back: replays change nothing, the log refuses a merge-style upsert, a completion keeps its first time, a bad row is refused.
- **Not done: a real sign-in against the live project.** Signing in means authenticating to a hosted account, which was not done on the user's behalf. So **nobody has watched attempts travel from a signed-in device to the server, seen a second real device pick them up, or run the offline test on a real network.** The pieces on each side were tested; the join between them, over real HTTP with a real session, was not. Do this first (see below).

**To try it for real.** Copy `apps/game/.env.example` to `apps/game/.env` (publishable key only). In the Supabase dashboard add the redirect URLs the link will return to (`soundlings://auth`, and the web origin you test on) under Authentication, URL configuration. Sign in, play a quest, then in the SQL editor `select count(*) from task_attempts` and confirm the rows are there. Sign in with the same email in a second browser profile and look for the child. Then switch the network off (browser dev tools, Offline), play a whole quest, switch it back on and watch the count rise.

**Known limits of the sync, stated plainly.**

- **Clock skew can reorder mastery.** A rebuild orders attempts by the time written on them, because two devices deliver their halves in any order. A device whose clock is behind will have its play folded in earlier than the live game folded it. Both converge once a pull rebuilds, but between them the two numbers can differ slightly.
- **Rebuilt high scores are inferred.** The log records answers, not the quest they belonged to, so a quest counts as finished if it has at least the shortest quest's worth of completed tasks (8). A quest abandoned after 9 tasks can therefore earn stars on a second device. Cosmetic, and only ever adds.
- **Rebuilt confusions are a floor.** The live count includes second and third wrong taps that leave no attempt behind, so the larger of the two is kept.
- **The server cannot lower a completion time.** The table has no update policy (a latch that can be lowered is not a latch), so it keeps whichever time arrived first. A device that finished earlier keeps its own earlier time; the server and that device can disagree about the exact moment, never about whether.
- **A profile deleted on one device is deleted on the other**, unless the other holds play the server never saw, in which case the child is put back rather than that play destroyed.
- **Two children with the same name** (made on two devices while offline) both survive and appear twice in the picker. Refusing one would lose a real history.
- **Pull is by id, read in full.** Every sync lists the ids of the whole log. Fine for hundreds of attempts per child; a watermark would be the next step if logs grow large.
- **Legacy ids.** A profile or attempt made before sync existed has no UUID; one is derived from its contents (and, for a profile, the parent), the same on every device.

## New in Plan 4: the grown-up's view

Until now nobody, parent or developer, could see what the adaptive engine knew. There is now a parent area.

**How to reach it.** Pick a profile, and on the island tap the small **Grown-ups** link at the bottom (beside Levels and Trophies, deliberately as plain as they are: a child can find it and lose interest). The first time, it asks you to **choose a four-digit PIN** and type it twice. After that it asks for the PIN. "Forgotten it?" clears the PIN and says, before you confirm, that anyone holding the device can do the same.

**The PIN stops a child, not an adult.** It is stored as a salted hash only so that it is not sitting in storage as plain digits; there are only 10,000 four-digit PINs, and a grown-up with the device can clear its storage. It is a gate for a five-year-old and the screen says so. It replaces the two-second hold: **adding a profile no longer needs anything** (it destroys nothing), and **deleting one asks for the PIN**. A hold cannot be done from a keyboard or a screen reader and a PIN field can.

**What it shows, in the order a worried parent would stop reading:**

1. **"A grown-up beside them will help most"**, only if the "needs a hand" signal is raised. Written as help, never as a verdict; no numbers.
2. **The sounds.** One row per sound, **hearing** and **seeing** apart (a child often has one without the other, and the practice that helps differs), each a colour and a word: *Knows it*, *Still learning*, *Worth a quick revisit*, *Not met yet*. A live reading of "what can they do right now", so a sound known last month and not since shows as worth a revisit, while the level-select badge, which is a latch, stays earned. The two can disagree, on purpose.
3. **What they are mixing up.** Pairs the child has mixed up at least twice in their last three sittings. Read from the attempt log, not the lifetime confusion map, so an old mix-up does not follow them for ever.
4. **Try this.** Up to three things, each naming two real words (`sit  sip`) that contain the sound and use sounds the child has met.
5. **Plain counts**, small, last.

No charts and no percentages anywhere, on purpose: "68% correct" reads as a school mark.

**How "needs a hand" is derived.** Over the child's last three real sittings (six or more answers each, thirty or more in all): every one of them, and the three together, must be no better than about 1.5 standard deviations above what *guessing among the choices they actually saw* would give. Two choices means 50% is chance; four means 25%; a flat threshold is wrong in both directions. The choice count is now written onto each attempt (older logs fall back to a reconstruction). It rests on the taps alone: Word Builder is left out, because the engine's own near-chance children pass it as often as anything. One good sitting clears it, and it clears of its own accord when the child improves.

**What that does and does not catch.** Simulated, at 14 answers a sitting, the chance it is raised at some point in the first ten sittings is about 99% for a child guessing on two or four choices, about 1% for a child right 80% of the time on two choices, and about 27% for one right 70% of the time. **It measures "at chance given the choices", which is stricter than the 55% "near-chance" profile in §11.1.** 55% is chance on two choices but well above it on four, so that profile is flagged in roughly half of runs within ten quests, not nearly always. The threshold is one constant (`Z_LIMIT`) if real children say it should move.


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

Choosing a profile is never gated. (This section originally described a two-second hold for creating and deleting a profile; Plan 4 replaced it with a PIN for deleting, and nothing for adding. See above.)

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

1. **Make a profile.** The add sheet opens by itself the first time. Type a name, pick a face, tap Add.
2. **Tap your face** to land on the island.
3. **Play a full quest.** Fourteen tasks, about five minutes.
4. **Play far enough to meet all seven mini-games.** This is the most important new thing to try. Sound Hunt, Sound Singer and Picture Start arrive on day one. **Picture Match, Word Pick, Word Builder and Missing Letter need words, so they arrive several quests in**, once a few sounds are known: until then a child is asked about sounds only. Picture Match in particular has been built and tested since Plan 1 and **nobody has ever seen it running**. Play on until all seven have come up, and judge each one by looking: are the pictures recognisable, do the three written words in Word Pick read at a glance, does the gap in Missing Letter read as a gap.
2. **Get something wrong on purpose, twice on the same letter.** Watch the hint ladder: the owl nudges, the mnemonic appears, the choices narrow, and finally the answer is revealed for you to tap. You stay on the task throughout — the game does not move you past something you have not learnt.
3. **Do nothing for ten seconds.** The ladder escalates on idling too, but never as far as revealing the answer. A child who pauses is thinking, and handing them the answer steals a win they were about to earn.
4. **Reload the page mid-quest.** You resume on the same task, with the same plan. Progress is written after every single task.
5. **Play four or five quests** to see a creature hatch.

## What to listen for

The placeholder voice **has been listened to by a person and judged usable for testing.** That is all it has been judged. It is machine-generated, and when a human voice replaces it, **check every phoneme individually**, not by sampling: two of them were wrong in earlier versions and were found by analysis rather than by ear, which is exactly the kind of fault a quick listen would miss. Audio is the game; every task is a sound.

- `s` must say **"sss"**, not "ess". A letter *name* where a letter *sound* belongs is the single most common way phonics software gets it wrong, and it actively teaches a child something false.
- `a` must be the short /a/ of **cat**, not the long "ah" of *father*. This one was wrong and was fixed by cutting the vowel out of the word "at"; it has been verified by formant analysis but never by a human ear.
- `i` must be the short /i/ of **sit**. This was previously the letter name "eye" — exactly the error above — and was caught late.
- `m` must be **"mmm"**, not "em".

If any of those are wrong in the placeholder, the fix is in `scripts/generate-placeholder-audio.sh`; in a human recording, it is a re-take.

---

## What is deliberately not here

- **The voice is a machine-generated placeholder** (macOS `say`). It has been heard and is usable for testing, but **a human voice is still needed before wider use** — see spec §9.3 for costs and the recommended hybrid approach — and each phoneme should be checked individually when it lands.
- **Pictures are emoji** standing in for illustration. Picture Start's pictures were chosen to be named unambiguously, but they are still emoji and still need the real-artwork test (can a five-year-old name each one unprompted?). The *word* pictures used by Picture Match and Word Pick are survivable when ambiguous, because the child reads the word; the mat (a person doing yoga) and fit (a muscle) are the weakest.
- **The parent area reads this device's record.** With sync on, that record includes what other devices pushed, but there is no separate dashboard for a parent's phone yet; the phone runs the same app.
- **Sync is built and tested but has not been run signed in against the live project.** See Plan 5 above. Without an account the game is local only, as before.
- **Only Level 1.** Levels 2–6 come later. The second mini-game per skill is done (Plan 3), except for `i`'s letter-to-sound, which has only one.
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
- **The mastery gate is statistical, not absolute.** A child answering at chance will eventually pass it given enough attempts — measured at about 72 quests. The real safeguard is telling the grown-up, which the parent area's "needs a hand" signal now does (see above).
- **`growthFactor: 4` is measured, not principled.** It implies two months' retention from three correct answers. It produced the best pacing in a grid search; it deserves checking against real children.
- **No child has played it.** Everything here has been judged by adults and by simulated children. The pacing numbers are a simulation, the "needs a hand" thresholds have never met a real five-year-old, and whether a child can name each picture, tell the sounds apart and sit through a quest is untested.
- **The audio is a placeholder.** See above.

## Open, unresolved

**A React duplicate-key warning for `fit`**, seen once in the browser console during Plan 4 and not reproduced since. Investigated and not explained: the parent screen's cards are keyed by `kind:about` and never by a word, a suggestion's own two words are asserted distinct, and 400 seeds of built sessions produced no duplicate choices in Picture Match or Word Pick. It may have been a stale entry from a build mid-edit.

It is recorded here rather than closed, because an unexplained key collision can cause React to duplicate or omit a child, and the next person to see it should know it has been looked for once already. If it reappears, note the exact screen and the steps.
