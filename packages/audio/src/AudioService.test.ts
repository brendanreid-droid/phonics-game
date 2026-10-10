import { describe, expect, it, vi } from 'vitest';
import { AudioService } from './AudioService';
import type { ClipPlayer } from './AudioService';

/** A fake player that records calls and resolves when told to. */
function fakePlayer() {
  const played: string[] = [];
  let resolveCurrent: (() => void) | null = null;
  const player: ClipPlayer = {
    play: vi.fn(async (key: string) => {
      played.push(key);
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
    }),
    stop: vi.fn(async () => {
      resolveCurrent?.();
      resolveCurrent = null;
    }),
    preload: vi.fn(async () => {}),
  };
  return {
    player,
    played,
    finishCurrent: () => {
      resolveCurrent?.();
      resolveCurrent = null;
    },
  };
}

/**
 * Lets every pending promise continuation run. The service chains several
 * promises per clip, so a single `await Promise.resolve()` is not enough to
 * reach the next clip; a macrotask boundary is.
 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AudioService', () => {
  it('plays a queued clip', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const done = audio.say('ph.s');
    await Promise.resolve();
    expect(played).toEqual(['ph.s']);
    finishCurrent();
    await done;
  });

  it('never overlaps two clips — the second waits for the first', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const first = audio.say('ui.which_says');
    const second = audio.say('ph.s');
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says']);
    finishCurrent();
    await first;
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says', 'ph.s']);
    finishCurrent();
    await second;
  });

  it('plays a sequence in order as one unit', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const done = audio.sayAll(['ui.which_says', 'ph.m']);
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says']);
    finishCurrent();
    await flush();
    expect(played).toEqual(['ui.which_says', 'ph.m']);
    finishCurrent();
    await done;
  });

  it('interrupts and clears the queue when the child taps ahead', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    void audio.say('ui.which_says');
    void audio.say('ph.s');
    await Promise.resolve();
    // interrupt() resolves when the interrupting clip has finished playing.
    const interrupted = audio.interrupt('praise.1');
    await flush();
    expect(player.stop).toHaveBeenCalled();
    expect(played).toEqual(['ui.which_says', 'praise.1']);
    finishCurrent();
    await interrupted;
  });

  it('plays nothing while muted but still resolves', async () => {
    const { player, played } = fakePlayer();
    const audio = new AudioService(player);
    audio.setMuted(true);
    await audio.say('ph.s');
    expect(played).toEqual([]);
  });

  it('resumes playing when unmuted', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    audio.setMuted(true);
    await audio.say('ph.s');
    audio.setMuted(false);
    const done = audio.say('ph.a');
    await Promise.resolve();
    expect(played).toEqual(['ph.a']);
    finishCurrent();
    await done;
  });

  it('never repeats the previous praise clip', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    for (let i = 0; i < 20; i += 1) {
      const done = audio.praise(() => 0);
      await Promise.resolve();
      finishCurrent();
      await done;
    }
    for (let i = 1; i < played.length; i += 1) {
      expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it('survives a player that rejects, so one bad clip cannot freeze the quest', async () => {
    const player: ClipPlayer = {
      play: vi.fn(async () => {
        throw new Error('decode failed');
      }),
      stop: vi.fn(async () => {}),
      preload: vi.fn(async () => {}),
    };
    const audio = new AudioService(player);
    await expect(audio.say('ph.s')).resolves.toBeUndefined();
  });

  it('preloads via the player', async () => {
    const { player } = fakePlayer();
    const audio = new AudioService(player);
    await audio.preload(['ph.s', 'ph.a']);
    expect(player.preload).toHaveBeenCalledWith(['ph.s', 'ph.a']);
  });
});

describe('AudioService serialisation', () => {
  /**
   * A player that treats overlap as a hard error. Each clip occupies the
   * "speaker" for a few milliseconds; if play() is ever entered while another
   * clip is still sounding, the overlap is recorded.
   */
  function speakerPlayer(clipMs = 3) {
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    let release: (() => void) | null = null;
    const player: ClipPlayer = {
      play: async (key) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        log.push(key);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, clipMs);
          release = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        active -= 1;
      },
      stop: async () => {
        // A real stop settles a few ticks late; the queue must not leak the
        // next clip into that gap.
        release?.();
        await Promise.resolve();
        await Promise.resolve();
      },
      preload: async () => {},
    };
    return { player, log, maxActive: () => maxActive };
  }

  it('never has two clips sounding at once across a burst of mixed calls', async () => {
    const { player, log, maxActive } = speakerPlayer();
    const audio = new AudioService(player);
    const all = [
      audio.say('ui.which_says'),
      audio.say('ph.s'),
      audio.sayAll(['ui.find_letter', 'ph.m', 'ph.a']),
      audio.praise(() => 0),
      audio.encourage(() => 0),
      audio.say('ph.t'),
    ];
    await Promise.all(all);
    expect(maxActive()).toBe(1);
    // Arrival order is playback order.
    expect(log[0]).toBe('ui.which_says');
    expect(log.slice(1, 5)).toEqual(['ph.s', 'ui.find_letter', 'ph.m', 'ph.a']);
    expect(log).toHaveLength(8);
  });

  it('stays serialised when the child interrupts mid-queue', async () => {
    const { player, log, maxActive } = speakerPlayer(20);
    const audio = new AudioService(player);
    void audio.say('ui.which_says');
    void audio.say('ph.s');
    await flush();
    await audio.interrupt('praise.1');
    expect(maxActive()).toBe(1);
    expect(log).toEqual(['ui.which_says', 'praise.1']);
  });

  it('abandons the rest of an interrupted sequence rather than talking on', async () => {
    const { player, log, maxActive } = speakerPlayer(20);
    const audio = new AudioService(player);
    void audio.sayAll(['ui.which_says', 'ph.m', 'ph.a']);
    await flush();
    await audio.interrupt('praise.1');
    expect(maxActive()).toBe(1);
    expect(log).toEqual(['ui.which_says', 'praise.1']);
  });

  it('goes quiet immediately when muted mid-clip, and drops the rest of the queue', async () => {
    const { player, log } = speakerPlayer(20);
    const audio = new AudioService(player);
    const first = audio.sayAll(['ui.which_says', 'ph.m']);
    void audio.say('ph.s');
    await flush();
    audio.setMuted(true);
    await first;
    await flush();
    expect(log).toEqual(['ui.which_says']);
  });

  it('keeps working after an interrupt', async () => {
    const { player, log, maxActive } = speakerPlayer();
    const audio = new AudioService(player);
    void audio.say('ui.which_says');
    await flush();
    await audio.interrupt('praise.1');
    await audio.sayAll(['ph.s', 'ph.m']);
    expect(maxActive()).toBe(1);
    expect(log).toEqual(['ui.which_says', 'praise.1', 'ph.s', 'ph.m']);
  });
});
