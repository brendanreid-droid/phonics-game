import { ENCOURAGE_KEYS, PRAISE_KEYS, hasAudio } from './manifest';

/**
 * The platform-specific half of audio. Injected so AudioService can be unit
 * tested in Node without a simulator; the Expo implementation lives in
 * apps/game.
 */
export interface ClipPlayer {
  /** Resolves when the clip has finished, or as soon as stop() cuts it short. */
  play(key: string): Promise<void>;
  stop(): Promise<void>;
  preload(keys: string[]): Promise<void>;
}

type QueueItem = { keys: string[]; resolve: () => void };

/**
 * Serialises all speech.
 *
 * Every clip goes through one queue, so two voices can never talk over each
 * other. For an adult overlapping audio is annoying; for a child trying to
 * isolate a single phoneme it makes the task impossible, and they will read
 * that as their own failure.
 */
export class AudioService {
  private queue: QueueItem[] = [];

  private running = false;

  private muted = false;

  private lastPraiseIndex = -1;

  /**
   * Bumped by every interrupt or mute. A queue item that began under an older
   * generation stops after its current clip instead of speaking on, so an
   * interrupted sequence cannot resume over whatever replaced it.
   */
  private generation = 0;

  constructor(private readonly player: ClipPlayer) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.generation += 1;
      this.clearQueue();
      // Muting must silence a clip that is already sounding, not just the
      // ones behind it.
      void this.player.stop().catch(() => {});
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  preload(keys: string[]): Promise<void> {
    return this.player.preload(keys.filter((key) => hasAudio(key)));
  }

  /** Queues one clip. Resolves when it has finished playing. */
  say(key: string): Promise<void> {
    return this.sayAll([key]);
  }

  /** Queues several clips as one unit: they stay together in the queue and are abandoned together if interrupted or muted. */
  sayAll(keys: string[]): Promise<void> {
    if (this.muted) return Promise.resolve();
    const playable = keys.filter((key) => hasAudio(key));
    if (playable.length === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.queue.push({ keys: playable, resolve });
      void this.drain();
    });
  }

  /**
   * Stops whatever is playing, drops the queue, and plays this immediately.
   * Used when the child taps an answer: their action must be acknowledged at
   * once, not after the instruction finishes reading itself out.
   *
   * The queue is cleared BEFORE stopping. Stopping makes the current clip's
   * play() settle, which lets the drain loop move on; if anything were still
   * queued at that moment it would start playing in the gap before we got
   * around to clearing it.
   *
   * Resolves when the interrupting clip has finished.
   */
  async interrupt(key: string): Promise<void> {
    this.generation += 1;
    this.clearQueue();
    try {
      await this.player.stop();
    } catch {
      // Nothing to stop, or the player could not; the new clip still plays.
    }
    await this.say(key);
  }

  /** A randomised praise clip, never the same one twice in a row. */
  praise(random: () => number = Math.random): Promise<void> {
    return this.say(this.pickVaried(PRAISE_KEYS, random));
  }

  encourage(random: () => number = Math.random): Promise<void> {
    if (ENCOURAGE_KEYS.length === 0) return Promise.resolve();
    const index = Math.floor(random() * ENCOURAGE_KEYS.length);
    return this.say(ENCOURAGE_KEYS[index]);
  }

  private pickVaried(keys: string[], random: () => number): string {
    if (keys.length === 0) return '';
    if (keys.length === 1) return keys[0];
    let index = Math.floor(random() * keys.length);
    if (index === this.lastPraiseIndex) index = (index + 1) % keys.length;
    this.lastPraiseIndex = index;
    return keys[index];
  }

  private clearQueue(): void {
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) item.resolve();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;
        const generation = this.generation;
        for (const key of item.keys) {
          if (generation !== this.generation) break;
          try {
            await this.player.play(key);
          } catch {
            // A single undecodable clip must not freeze the quest. The child
            // sees the task either way; losing one prompt is recoverable,
            // a frozen screen is not.
          }
        }
        item.resolve();
      }
    } finally {
      this.running = false;
    }
  }
}
