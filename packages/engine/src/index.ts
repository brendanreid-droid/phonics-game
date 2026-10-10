export type { TargetId } from '@soundlings/curriculum';
export * from './types';
export * from './config';
export * from './rng';
export * from './taskTypes';
export * from './distractors';
export * from './frustration';
export * from './completion';
export * from './taskOutcome';
export { buildSession } from './sessionBuilder';
export type { BuildSessionArgs } from './sessionBuilder';
export {
  applyAttempt,
  emptyRecord,
  getRecord,
  isMastered,
  recordAttempt,
  recordAttempts,
  strengthAt,
} from './mastery';
export { simulateChild } from './simulate';
export type { ChildProfile, SimulateArgs, SimulateResult } from './simulate';
