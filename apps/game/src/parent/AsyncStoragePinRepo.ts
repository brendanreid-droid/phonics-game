import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPin, isValidPinFormat, randomSalt, verifyPin } from './pin';
import type { StoredPin } from './pin';
import type { PinRepo } from './PinRepo';

const PIN_KEY = 'soundlings/parentPin';

/**
 * What reading the stored PIN produced. `io` is kept apart from `none` for the
 * reason it is kept apart in AsyncStorageProfileRepo: a storage hiccup is not
 * the same as there being no PIN. Reading "none" would put the "choose a PIN"
 * screen in front of a child; reading `io` as "set" keeps the gate shut until
 * storage answers, and a retry gets through.
 */
type PinRead = { kind: 'ok'; stored: StoredPin } | { kind: 'none' } | { kind: 'io' };

/**
 * Device-backed PinRepo.
 *
 * Every operation goes through one queue, for the reason AsyncStorageProfileRepo
 * does: AsyncStorage has no transactions, so overlapping calls can interleave
 * and the PIN a grown-up just chose could be overwritten by a call that began
 * before it.
 *
 * A stored value that is not a salt and a hash (truncated, or written by some
 * other build) counts as no PIN rather than as a PIN nobody can match. The
 * alternative is a grown-up locked out of their own child's data for good,
 * which is worse than the weak gate it would protect.
 *
 * `set` and `clear` reject when they cannot write; see PinRepo.
 */
export class AsyncStoragePinRepo implements PinRepo {
  private tail: Promise<unknown> = Promise.resolve();

  /** `newSalt` is injectable so a test can pin it down. */
  constructor(private readonly newSalt: () => string = randomSalt) {}

  isSet(): Promise<boolean> {
    return this.serial(async () => (await this.read()).kind !== 'none');
  }

  set(pin: string): Promise<void> {
    return this.serial(async () => {
      if (!isValidPinFormat(pin)) throw new Error('A PIN must be four digits.');
      // Not caught: a PIN that did not save must not look saved.
      await AsyncStorage.setItem(PIN_KEY, JSON.stringify(hashPin(pin, this.newSalt())));
    });
  }

  verify(pin: string): Promise<boolean> {
    return this.serial(async () => {
      const read = await this.read();
      return read.kind === 'ok' && verifyPin(pin, read.stored);
    });
  }

  clear(): Promise<void> {
    // Not caught: a reset that did not happen must not be reported as one.
    return this.serial(() => AsyncStorage.removeItem(PIN_KEY));
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<PinRead> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(PIN_KEY);
    } catch {
      return { kind: 'io' };
    }
    if (raw === null) return { kind: 'none' };
    try {
      const parsed: unknown = JSON.parse(raw);
      return isStoredPin(parsed) ? { kind: 'ok', stored: parsed } : { kind: 'none' };
    } catch {
      return { kind: 'none' };
    }
  }
}

function isStoredPin(value: unknown): value is StoredPin {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<StoredPin>;
  return typeof v.salt === 'string' && v.salt.length > 0 && typeof v.hash === 'string' && v.hash.length > 0;
}
