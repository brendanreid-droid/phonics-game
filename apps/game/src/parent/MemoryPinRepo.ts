import { hashPin, isValidPinFormat, randomSalt, verifyPin } from './pin';
import type { StoredPin } from './pin';
import type { PinRepo } from './PinRepo';

/** In-memory PinRepo for tests and for development. */
export class MemoryPinRepo implements PinRepo {
  private stored: StoredPin | null = null;

  /** `newSalt` is injectable so a test can pin it down. */
  constructor(private readonly newSalt: () => string = randomSalt) {}

  async isSet(): Promise<boolean> {
    return this.stored !== null;
  }

  async set(pin: string): Promise<void> {
    if (!isValidPinFormat(pin)) throw new Error('A PIN must be four digits.');
    this.stored = hashPin(pin, this.newSalt());
  }

  async verify(pin: string): Promise<boolean> {
    return this.stored !== null && verifyPin(pin, this.stored);
  }

  async clear(): Promise<void> {
    this.stored = null;
  }
}
