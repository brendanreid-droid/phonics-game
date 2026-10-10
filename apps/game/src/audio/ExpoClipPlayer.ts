import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { audioPath } from '@soundlings/audio';
import type { ClipPlayer } from '@soundlings/audio';

type Player = ReturnType<typeof createAudioPlayer>;

/**
 * A clip that never reports completion must not hang the quest. Longer than
 * any real clip in the pack, short enough that a stuck one is not a stall.
 */
export const PLAY_TIMEOUT_MS = 6000;

/** The play() currently awaiting its clip. `settle` resolves it exactly once. */
interface Pending {
  settle: () => void;
}

/**
 * expo-audio implementation of ClipPlayer.
 *
 * Players are cached per key. Creating a player on every prompt adds audible
 * latency, and a child who taps before the sound arrives has effectively been
 * asked nothing.
 *
 * Contract (see ClipPlayer): stop() must make a pending play() settle. The
 * AudioService drain loop awaits play(); if stop() paused the clip but left
 * that promise hanging, the queue would deadlock and the quest would freeze
 * with no sound and no way forward. Every path out of play() — natural finish,
 * stop(), a newer play(), the timeout, a thrown error — therefore goes through
 * one idempotent `settle`.
 */
export class ExpoClipPlayer implements ClipPlayer {
  private readonly players = new Map<string, Player>();

  private current: Player | null = null;

  private pending: Pending | null = null;

  async configure(): Promise<void> {
    // Plays through the speaker even if the iPad's silent switch is on: the
    // whole game is audio, so silent playback would look like a broken app.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
  }

  async preload(keys: string[]): Promise<void> {
    for (const key of keys) this.playerFor(key);
  }

  async play(key: string): Promise<void> {
    // AudioService never overlaps clips, but if a caller ever does, the older
    // clip is cut and its promise settled rather than orphaned.
    // Synchronous on purpose: no await between here and registering `pending`,
    // so a stop() cannot slip into a gap and be lost.
    this.cut();

    const player = this.playerFor(key);
    this.current = player;

    await new Promise<void>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let subscription: { remove(): void } | undefined;

      // The single exit. Idempotent, so the finish event, stop(), the timeout
      // and a failed start can race without resolving twice or leaking a
      // listener or timer.
      const settle = (): void => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        subscription?.remove();
        if (this.pending === entry) this.pending = null;
        resolve();
      };
      const entry: Pending = { settle };
      this.pending = entry;

      // Listen before playing, so a very short clip cannot finish unheard.
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) settle();
      });
      timer = setTimeout(settle, PLAY_TIMEOUT_MS);

      try {
        void Promise.resolve(player.seekTo(0)).catch(() => {});
        player.play();
      } catch {
        // Could not start the clip: settle now, so the quest moves on silent
        // rather than waiting out the timeout.
        settle();
      }
    });
  }

  async stop(): Promise<void> {
    this.cut();
  }

  private cut(): void {
    const pending = this.pending;
    this.pending = null;
    const player = this.current;
    this.current = null;
    try {
      player?.pause();
    } finally {
      // Settle even if pause() threw: a pending play() must never be left hanging.
      pending?.settle();
    }
  }

  private playerFor(key: string): Player {
    const existing = this.players.get(key);
    if (existing) return existing;
    const created = createAudioPlayer(resolveAsset(key));
    this.players.set(key, created);
    return created;
  }
}

/**
 * Metro requires statically analysable require() calls for assets, so the
 * manifest path is mapped to a bundled module here. `audioPath` throws on an
 * unknown key, which keeps a typo loud instead of silent.
 *
 * RELEASE WARNING: bundled assets need real require() calls for Metro to
 * include them. This returns a URI, which is only expected to work in
 * development via the asset server; a standalone build will not contain the
 * clips. Before building a standalone app, replace the body with a generated
 * `ASSETS` map of literal
 * `require('../../assets/voice/placeholder-au/ph.s.m4a')` entries. Writing
 * that generator is Plan 2 work: it is not needed to reach the review gate,
 * and noting it here is cheaper than discovering it during a release build.
 */
function resolveAsset(key: string): { uri: string } {
  const relative = audioPath(key);
  return { uri: relative };
}
