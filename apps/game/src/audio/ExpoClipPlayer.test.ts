import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ExpoClipPlayer's contract with AudioService: stop() must make a pending
 * play() settle. If it did not, the AudioService drain loop would await forever
 * and a child's quest would freeze with no sound and no way forward.
 *
 * expo-audio is replaced with a scriptable fake; the real module needs a native
 * runtime. The fake only reports completion when the test says so, which is
 * exactly the situation that deadlocks: a clip that is stopped never finishes.
 */
type Listener = (status: { didJustFinish: boolean }) => void;

class FakePlayer {
  listeners = new Set<Listener>();
  playing = false;
  pauseThrows = false;
  playThrows = false;
  seeks: number[] = [];

  addListener(_event: string, listener: Listener) {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }
  seekTo(seconds: number) {
    this.seeks.push(seconds);
    return Promise.resolve();
  }
  play() {
    if (this.playThrows) throw new Error('cannot play');
    this.playing = true;
  }
  pause() {
    if (this.pauseThrows) throw new Error('cannot pause');
    this.playing = false;
  }
  finish() {
    this.playing = false;
    for (const l of [...this.listeners]) l({ didJustFinish: true });
  }
}

const created: FakePlayer[] = [];
const sources: unknown[] = [];

vi.mock('expo-audio', () => ({
  createAudioPlayer: (source: unknown) => {
    const p = new FakePlayer();
    created.push(p);
    sources.push(source);
    return p;
  },
  setAudioModeAsync: vi.fn(async () => {}),
}));

import { AudioService } from '@soundlings/audio';
import { ExpoClipPlayer, PLAY_TIMEOUT_MS } from './ExpoClipPlayer';

/** Resolves true if the promise has settled by the time the microtask queue drains. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  return done;
}

beforeEach(() => {
  created.length = 0;
  sources.length = 0;
  vi.useRealTimers();
});

describe('ExpoClipPlayer', () => {
  it('resolves play() when the clip reports it finished', async () => {
    const player = new ExpoClipPlayer();
    const playing = player.play('ph.s');
    expect(await settled(playing)).toBe(false);
    created[0].finish();
    expect(await settled(playing)).toBe(true);
  });

  it('stop() settles a pending play() even though the clip never finishes', async () => {
    const player = new ExpoClipPlayer();
    const playing = player.play('ph.s');
    expect(await settled(playing)).toBe(false);

    await player.stop();

    expect(await settled(playing)).toBe(true);
    expect(created[0].playing).toBe(false);
  });

  it('stop() settles a pending play() even if pausing the player throws', async () => {
    const player = new ExpoClipPlayer();
    const playing = player.play('ph.s');
    created[0].pauseThrows = true;

    await expect(player.stop()).rejects.toThrow('cannot pause');

    expect(await settled(playing)).toBe(true);
  });

  it('stop() with nothing playing is a harmless no-op', async () => {
    const player = new ExpoClipPlayer();
    await expect(player.stop()).resolves.toBeUndefined();
  });

  it('settles when the timeout fires for a clip that never reports completion', async () => {
    vi.useFakeTimers();
    const player = new ExpoClipPlayer();
    const playing = player.play('ph.s');
    expect(await settled(playing)).toBe(false);
    await vi.advanceTimersByTimeAsync(PLAY_TIMEOUT_MS);
    expect(await settled(playing)).toBe(true);
  });

  it('settles at once if the clip cannot be started, rather than waiting out the timeout', async () => {
    const player = new ExpoClipPlayer();
    await player.preload(['ph.s']);
    created[0].playThrows = true;
    expect(await settled(player.play('ph.s'))).toBe(true);
  });

  it('removes its listener and timer once settled, so replays do not stack them', async () => {
    vi.useFakeTimers();
    const player = new ExpoClipPlayer();
    const first = player.play('ph.s');
    created[0].finish();
    await first;
    expect(created[0].listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    const second = player.play('ph.s');
    await player.stop();
    await second;
    expect(created[0].listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a second play() cuts the first clip and settles it instead of orphaning it', async () => {
    const player = new ExpoClipPlayer();
    const first = player.play('ph.s');
    const second = player.play('ph.a');
    expect(await settled(first)).toBe(true);
    expect(created[0].playing).toBe(false);
    expect(await settled(second)).toBe(false);
    created[1].finish();
    expect(await settled(second)).toBe(true);
  });

  it('a stale finish event from a stopped clip does not settle the next one', async () => {
    const player = new ExpoClipPlayer();
    const first = player.play('ph.s');
    await player.stop();
    await first;
    const second = player.play('ph.s');
    expect(await settled(second)).toBe(false);
    created[0].finish();
    expect(await settled(second)).toBe(true);
  });

  it('caches one native player per key and restarts it from the beginning', async () => {
    const player = new ExpoClipPlayer();
    await player.preload(['ph.s', 'ph.a']);
    expect(created.length).toBe(2);

    const first = player.play('ph.s');
    created[0].finish();
    await first;
    const again = player.play('ph.s');
    created[0].finish();
    await again;

    expect(created.length).toBe(2);
    expect(created[0].seeks).toEqual([0, 0]);
  });

  it('throws on an unknown audio key rather than failing silently', async () => {
    await expect(new ExpoClipPlayer().play('no.such.key')).rejects.toThrow('Unknown audio key');
  });

  it('configures the audio session to play through the silent switch', async () => {
    const { setAudioModeAsync } = await import('expo-audio');
    await new ExpoClipPlayer().configure();
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true, shouldPlayInBackground: false }),
    );
  });
});

describe('ExpoClipPlayer driven by AudioService', () => {
  it('interrupt() during a clip does not deadlock the queue', async () => {
    const service = new AudioService(new ExpoClipPlayer());

    const instruction = service.say('ph.s');
    expect(await settled(instruction)).toBe(false);

    const answer = service.interrupt('ph.a');
    // The interrupted instruction settles because stop() settled its play().
    expect(await settled(instruction)).toBe(true);
    expect(await settled(answer)).toBe(false);

    // The interrupting clip is the second native player; finishing it ends the sequence.
    created[1].finish();
    expect(await settled(answer)).toBe(true);

    // And the queue is still alive afterwards.
    const next = service.say('ph.t');
    created[2].finish();
    expect(await settled(next)).toBe(true);
  });

  it('muting mid-clip silences it and does not strand the queue', async () => {
    const service = new AudioService(new ExpoClipPlayer());
    const first = service.say('ph.s');
    const behind = service.say('ph.a');
    service.setMuted(true);
    expect(await settled(first)).toBe(true);
    expect(await settled(behind)).toBe(true);
    expect(created[0].playing).toBe(false);
  });
});
