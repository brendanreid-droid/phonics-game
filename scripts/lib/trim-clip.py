"""
Trims and levels one recorded clip, writing a 16-bit mono WAV.

    python3 -I scripts/lib/trim-clip.py in.wav out.wav

Prints one line of JSON describing what it did, which the importer collects
into packages/audio/src/human-au.measured.json so a test can assert the trim
actually happened.

## Why this exists

The recorded pack arrived with roughly half a second of silence at each end of
every clip. The game plays phonemes back to back with no inserted gap --
AudioService.sayAll hands the player one key after another -- so that padding
is not harmless margin, it is a full second of dead air between the sounds of a
word. A child sounding out s-i-t with a second's silence between each sound
hears three unrelated noises and never hears "sit". Blending is the whole
skill, so the padding had to go before the pack could be used at all.

Levels needed the same treatment for a quieter reason: the recorded phonemes
peaked between 0.33 and 0.79 of full scale while the words sat at 0.79, so the
single sounds -- the hardest thing in the game to hear -- were also the
faintest. Peak normalisation rather than loudness matching, deliberately: a
plosive like /p/ is a short spike with little energy in it, and matching
perceived loudness would drive its peak into clipping.

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

# Where the clip is considered to have started. A fricative such as /s/ fades
# in gradually, so a high threshold would cut the beginning of the hiss off;
# 2.5% of the clip's own peak keeps it while still rejecting room noise.
ONSET_FRACTION = 0.025

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


def main():
    src, dst = sys.argv[1], sys.argv[2]
    samples, rate = read_mono(src)
    hop = max(1, int(rate * HOP_MS / 1000))
    env = envelope(samples, hop)
    peak = max(env)
    if peak == 0:
        raise SystemExit(f"{src}: silent")

    threshold = ONSET_FRACTION * peak
    loud = [i for i, e in enumerate(env) if e > threshold]
    if not loud:
        raise SystemExit(f"{src}: no audio above the onset threshold")

    lead_in = int(rate * LEAD_MS / 1000)
    tail_out = int(rate * TAIL_MS / 1000)
    start = max(0, loud[0] * hop - lead_in)
    end = min(len(samples), (loud[-1] + 1) * hop + tail_out)
    out = samples[start:end]

    gain = TARGET_PEAK * 32767 / peak
    out = [int(max(-32768, min(32767, round(v * gain)))) for v in out]

    for n, span in ((int(rate * FADE_IN_MS / 1000), False), (int(rate * FADE_OUT_MS / 1000), True)):
        n = min(n, len(out))
        for i in range(n):
            index = len(out) - 1 - i if span else i
            out[index] = int(out[index] * i / n) if n else out[index]

    with wave.open(dst, "wb") as o:
        o.setnchannels(1)
        o.setsampwidth(2)
        o.setframerate(rate)
        o.writeframes(struct.pack("<%dh" % len(out), *out))

    trimmed = envelope(out, hop)
    trimmed_peak = max(trimmed) or 1
    above = [i for i, e in enumerate(trimmed) if e > ONSET_FRACTION * trimmed_peak]
    print(
        json.dumps(
            {
                "durationMs": round(len(out) * 1000 / rate),
                "leadMs": round(above[0] * hop * 1000 / rate) if above else 0,
                "tailMs": round((len(out) - (above[-1] + 1) * hop) * 1000 / rate) if above else 0,
                "peak": round(trimmed_peak / 32768, 3),
                "sourceDurationMs": round(len(samples) * 1000 / rate),
            }
        )
    )


main()
