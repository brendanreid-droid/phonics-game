"""
Trims and levels one recorded clip, writing a 16-bit mono WAV.

    python3 -I scripts/lib/trim-clip.py <sound|word> in.wav out.wav

Prints one line of JSON describing what it did, which the importer collects
into packages/audio/src/human-au.measured.json so a test can assert the work
actually happened.

## Why this exists

Three things were wrong with the pack as recorded, and none of them was the
reader's fault -- two of them are what a person naturally does at a microphone.

**Silence at the ends.** The recording script asks for about half a second of
padding at each end and promises the game trims it. Nothing trimmed it. The
game plays clips back to back with no gap of its own -- AudioService.sayAll
hands the player one key after another -- so that padding would have become a
full second of dead air between the sounds of a word. A child sounding out
s-i-t with a second between each sound hears three noises, not a word, and
blending is the entire skill the game teaches.

**A breath before the word.** Several clips open with a quiet intake or a
false start, then a pause, then the word. Trimming to the first sound above a
noise floor keeps all of it, so the clip still begins with a third of a second
of nothing. Hence segmentation rather than a threshold: the clip is cut into
blocks of sound separated by silence, and the quiet scraps at either end are
dropped rather than merely measured.

**A phoneme said three times.** /t/ and /p/ cannot be held, so a reader
naturally gives them as "t, t, t". That is the right instinct in the booth and
the wrong file for this game, which plays one clip as one sound -- and plays it
three times over on a teaching card, which would have made nine. For a `sound`
clip the loudest single burst is kept and the rest discarded.

**Levels.** As delivered the phonemes peaked between 0.33 and 0.79 of full
scale while the words sat at 0.79, so the single sounds -- the hardest thing in
the game to hear -- were also the faintest. Every clip is now peak-normalised.
Peak rather than loudness, deliberately: a plosive is a short spike with little
energy in it, and matching perceived loudness would drive its peak into
clipping.

Standard library only, for the same reason as the rest of this directory: the
operator should not need to install anything to re-run it.
"""

import json
import struct
import sys
import wave

# A clip is trimmed to where it stops being silent, plus these margins. The
# lead is short enough not to be heard as a gap; the tail is longer so a
# plosive's release and a fricative's decay are not clipped off.
LEAD_MS = 15
TAIL_MS = 60

# Envelope resolution. 5ms is fine enough to find the onset of a plosive and
# coarse enough that one stray sample cannot define it.
HOP_MS = 5

# Below this fraction of the clip's own peak counts as silence for the purpose
# of finding the gaps between blocks of sound, and it differs by what the clip
# is. A word is measured against a low floor, because the decay of /sss/ trails
# a long way down and must not be read as a gap inside the word. The gaps
# between two takes of /t/ never reach that floor -- a quiet room still has a
# noise floor, and the reader is still breathing -- so a phoneme is measured
# against a higher one.
FLOOR_FRACTION = {"word": 0.03, "sound": 0.10}

# How long silence has to last before it counts as a gap, which differs by what
# the clip is. A word contains silence legitimately -- the closure before the
# /t/ in "at" is around 60ms -- so a word is only split on a clearly longer
# pause. A single phoneme is one articulation and contains no silence at all,
# so any real break in it separates two takes of the same sound.
GAP_MS = {"word": 110, "sound": 25}

# What counts as a block of real speech rather than a breath or a lip noise.
# Both conditions are needed: a breath can be long, and a lip smack can be
# momentarily loud.
MAJOR_PEAK_FRACTION = 0.35
MAJOR_MS = 50

# Silence longer than this separates one utterance from another, rather than
# marking a closure inside a word. Nobody pauses a quarter of a second in the
# middle of "at"; a reader who starts, stops and starts again leaves a gap far
# longer. Where a clip holds two utterances the longer one is the take.
UTTERANCE_GAP_MS = 250

# Fades, applied after trimming, so a cut never lands mid-waveform and clicks.
FADE_IN_MS = 8
FADE_OUT_MS = 30

# Peak target, about -1.5 dBFS. Short of full scale so that lossy encoding,
# which can overshoot the original samples slightly, cannot clip.
TARGET_PEAK = 0.84


def read_mono(path):
    with wave.open(path) as w:
        channels, width, rate, frames = (
            w.getnchannels(),
            w.getsampwidth(),
            w.getframerate(),
            w.getnframes(),
        )
        if width != 2:
            raise SystemExit(f"{path}: expected 16-bit samples, found {width * 8}-bit")
        samples = list(struct.unpack("<%dh" % (frames * channels), w.readframes(frames)))
    if channels > 1:
        samples = samples[::channels]
    return samples, rate


def envelope(samples, hop):
    return [max(abs(v) for v in samples[i : i + hop]) for i in range(0, len(samples), hop)]


def blocks(env, peak, floor_fraction, gap_hops):
    """Runs of sound, as (start, end) hop indices, split on long enough silence."""
    floor = floor_fraction * peak
    loud = [i for i, e in enumerate(env) if e > floor]
    if not loud:
        return []
    out = [[loud[0], loud[0] + 1]]
    for i in loud[1:]:
        if i - out[-1][1] >= gap_hops:
            out.append([i, i + 1])
        else:
            out[-1][1] = i + 1
    return [tuple(b) for b in out]


def main():
    kind, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    if kind not in ("sound", "word"):
        raise SystemExit(f"kind must be 'sound' or 'word', not {kind!r}")

    samples, rate = read_mono(src)
    hop = max(1, int(rate * HOP_MS / 1000))
    env = envelope(samples, hop)
    peak = max(env)
    if peak == 0:
        raise SystemExit(f"{src}: silent")

    found = blocks(env, peak, FLOOR_FRACTION[kind], max(1, int(GAP_MS[kind] / HOP_MS)))
    major = [
        b
        for b in found
        if max(env[b[0] : b[1]]) >= MAJOR_PEAK_FRACTION * peak
        and (b[1] - b[0]) * HOP_MS >= MAJOR_MS
    ]
    if not major:
        raise SystemExit(f"{src}: nothing in it is loud enough to be speech")

    if kind == "sound":
        # One sound per clip. Where a reader gave three takes of /t/ in one
        # file, the loudest is the one kept; the latest breaks a tie, on the
        # grounds that a reader settles rather than tires over three seconds.
        best = max(major, key=lambda b: (max(env[b[0] : b[1]]), b[0]))
        first, last = best, best
    else:
        # A word may hold silence inside it -- the closure before the /t/ in
        # "at" -- so everything from the first real block to the last is kept.
        # But a quarter-second of nothing is not a closure, it is the reader
        # starting again, so blocks that far apart are separate takes and only
        # the longer one is the word.
        gap = UTTERANCE_GAP_MS / HOP_MS
        takes = [[major[0]]]
        for block in major[1:]:
            if block[0] - takes[-1][-1][1] >= gap:
                takes.append([])
            takes[-1].append(block)
        take = max(takes, key=lambda t: sum(b[1] - b[0] for b in t))
        first, last = take[0], take[-1]

    # The blocks were found against a floor high enough to separate two takes of
    # the same sound, and that floor sits well above the tail of a fricative. So
    # the chosen edges are now let back out against the low floor, which
    # recovers the decay of /sss/ and /fff/ without re-joining what was split --
    # the expansion stops at the neighbouring block either side.
    low = FLOOR_FRACTION["word"] * peak
    limit_lo = max((b[1] for b in found if b[1] <= first[0]), default=0)
    limit_hi = min((b[0] for b in found if b[0] >= last[1]), default=len(env))
    lo, hi = first[0], last[1]
    while lo > limit_lo and env[lo - 1] > low:
        lo -= 1
    while hi < limit_hi and hi < len(env) and env[hi] > low:
        hi += 1

    lead_in = int(rate * LEAD_MS / 1000)
    tail_out = int(rate * TAIL_MS / 1000)
    start = max(0, lo * hop - lead_in)
    end = min(len(samples), hi * hop + tail_out)
    out = samples[start:end]

    gain = TARGET_PEAK * 32767 / peak
    out = [int(max(-32768, min(32767, round(v * gain)))) for v in out]

    for n, from_end in ((int(rate * FADE_IN_MS / 1000), False), (int(rate * FADE_OUT_MS / 1000), True)):
        n = min(n, len(out))
        for i in range(n):
            index = len(out) - 1 - i if from_end else i
            out[index] = int(out[index] * i / n) if n else out[index]

    with wave.open(dst, "wb") as o:
        o.setnchannels(1)
        o.setsampwidth(2)
        o.setframerate(rate)
        o.writeframes(struct.pack("<%dh" % len(out), *out))

    trimmed = envelope(out, hop)
    trimmed_peak = max(trimmed) or 1
    above = [i for i, e in enumerate(trimmed) if e > FLOOR_FRACTION["word"] * trimmed_peak]
    print(
        json.dumps(
            {
                "durationMs": round(len(out) * 1000 / rate),
                "leadMs": round(above[0] * hop * 1000 / rate) if above else 0,
                "tailMs": round((len(out) - (above[-1] + 1) * hop) * 1000 / rate) if above else 0,
                "peak": round(trimmed_peak / 32768, 3),
                "sourceDurationMs": round(len(samples) * 1000 / rate),
                # How many blocks of speech the source held, and how many
                # survived. A sound recorded as three takes shows 3 and 1, and
                # that is a clip somebody should listen to.
                "sourceBlocks": len(major),
                "keptBlocks": 1 if kind == "sound" else len(major),
            }
        )
    )


main()
