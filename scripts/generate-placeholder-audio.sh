#!/usr/bin/env bash
#
# Generates the PLACEHOLDER voice pack. Not for use with real children —
# see docs/superpowers/specs §9.3. Requires macOS.
#
# Phonemes are spelled phonetically because `say s` produces "ess" (the letter
# name), and teaching a child that `s` says "ess" is actively harmful.
#
# Short vowels: Karen cannot be told a phoneme directly (embedded
# `[[inpt PHON]]` markup is read aloud as words on current macOS voices), and
# spelling the vowel alone gives the wrong sound: "ah" is the long vowel of
# "father" and "ih" is read as the letter name "eye". So /a/ and /i/ are cut
# from the vowel of "at" and "it": the real short vowel, minus the final t.
# Marked `vowel` in the clip list below.
#
# Writes clips only. scripts/generate-audio-manifest.ts then decides which keys
# the game plays from here and which from a recorded pack, so this script and
# the importer are never both writing the manifest.
#
# Run from the repository root. Compatible with macOS's stock bash 3.2.

set -euo pipefail

VOICE="${VOICE:-Karen}"   # Australian English
OUT_DIR="apps/game/assets/voice/placeholder-au"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! command -v say >/dev/null 2>&1; then
  echo "error: 'say' not found. This script requires macOS." >&2
  exit 1
fi

if ! say -v "$VOICE" "" >/dev/null 2>&1; then
  echo "error: voice '$VOICE' is not installed." >&2
  echo "Install it in System Settings > Accessibility > Spoken Content > System Voices." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# The clip list lives in packages/audio/voice-script.txt, which is also what
# the Polly generator and the script handed to a human reader are built from.
# It used to be inline here, which meant the recording script would have been a
# second copy of it; two copies of 68 lines drift, and the drift shows up as a
# clip nobody recorded.
#
#   key | spoken text | IPA | mode | delivery note
#
# This script uses the first, second and fourth fields. IPA is for Polly and for
# the person reading; `mode` of `vowel` means cut the vowel out of the word.
SCRIPT_FILE="packages/audio/voice-script.txt"
if [ ! -f "$SCRIPT_FILE" ]; then
  echo "error: $SCRIPT_FILE not found. Run from the repository root." >&2
  exit 1
fi
CLIPS=$(grep -v '^#' "$SCRIPT_FILE" | grep -v '^[[:space:]]*$')

# Keeps only the vowel of a short word like "at": from onset to the point where
# the energy falls away into the closure of the final consonant. stdlib only.
TRIM_VOWEL_PY='
import struct, sys, wave
src, dst = sys.argv[1], sys.argv[2]
w = wave.open(src)
rate, frames = w.getframerate(), w.getnframes()
data = list(struct.unpack("<%dh" % frames, w.readframes(frames)))
hop = int(rate * 0.01)
env = [(sum(v * v for v in data[i:i + hop]) / hop) ** 0.5 for i in range(0, frames - hop, hop)]
peak = max(env)
start = next(i for i, e in enumerate(env) if e > 0.3 * peak)
peak_at = env.index(peak)
end = next((i for i in range(peak_at, len(env)) if env[i] < 0.45 * peak), len(env))
lo, hi = max(0, start - 1) * hop, end * hop
out = data[lo:hi]
fade = int(rate * 0.015)
for i in range(fade):
    out[len(out) - 1 - i] = int(out[len(out) - 1 - i] * i / fade)
o = wave.open(dst, "wb")
o.setnchannels(1); o.setsampwidth(2); o.setframerate(rate)
o.writeframes(struct.pack("<%dh" % len(out), *out))
o.close()
'

count=0

while IFS='|' read -r key text ipa mode note; do
  [ -z "$key" ] && continue
  aiff="$TMP/$key.aiff"
  m4a="$OUT_DIR/$key.m4a"
  say -v "$VOICE" -o "$aiff" "$text"
  if [ "${mode:-}" = "vowel" ]; then
    afconvert -f WAVE -d LEI16 "$aiff" "$TMP/$key.full.wav" >/dev/null
    python3 -c "$TRIM_VOWEL_PY" "$TMP/$key.full.wav" "$TMP/$key.wav"
    aiff="$TMP/$key.wav"
  fi
  rm -f "$m4a"   # afconvert refuses to overwrite
  afconvert -f m4af -d aac "$aiff" "$m4a" >/dev/null
  count=$((count + 1))
done <<< "$CLIPS"

echo "Generated $count placeholder clips in $OUT_DIR"
echo
echo "Next: npm run generate:audio-manifest && npm run generate:audio-map"
echo
echo "REMINDER: this is a placeholder pack. The phoneme clips are approximations,"
echo "and the manifest prefers a recorded clip wherever one exists, so these are"
echo "played only for the keys nobody has recorded yet."
