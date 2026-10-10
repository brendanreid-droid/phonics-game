import {
  DEFAULT_CONFIG,
  FrustrationGuard,
  attemptsForTask,
  buildSession,
  levelProgress,
  recordConfusion,
  recordTaskResult,
} from '@soundlings/engine';
import type {
  Attempt,
  ConfusionMap,
  EngineConfig,
  MasteryMap,
  TaskInstance,
  TaskOutcome,
} from '@soundlings/engine';
import { ENCOURAGE_KEYS, PRAISE_KEYS } from '@soundlings/audio';
import type { AudioService } from '@soundlings/audio';
import type { ActiveSession, ProgressRepo } from '../data/ProgressRepo';
import type { HintTier } from '../tasks/useHintLadder';
import {
  applyClosingSwap,
  confusionFor,
  isPlayablePlan,
  judgeAnswer,
  noteOutcome,
  preloadKeysFor,
  replanRemaining,
  replayQuest,
  starsFor,
} from './questLogic';
import type { QuestOutcomes, QuestTally } from './questLogic';

export interface QuestView {
  status: 'loading' | 'playing' | 'finished' | 'error';
  task: TaskInstance | null;
  index: number;
  total: number;
  /** The tier the frustration guard has imposed. Idling is merged in by the task itself. */
  tier: HintTier;
  stars: 1 | 2 | 3;
  /** Creatures earned during this quest, by id. */
  newCreatures: string[];
}

export interface QuestDeps {
  profileId: string;
  level: number;
  repo: ProgressRepo;
  audio: AudioService;
  now: () => number;
  config?: EngineConfig;
  /**
   * How long a right answer is given to land before the next task replaces it,
   * at most: it ends sooner if the praise clip finishes first. 0 advances at
   * once, which is what tests want.
   */
  celebrateMs?: number;
}

const LOADING: QuestView = {
  status: 'loading',
  task: null,
  index: 0,
  total: 0,
  tier: 0,
  stars: 3,
  newCreatures: [],
};

/**
 * Runs one quest. Plain TypeScript with no React in it, so the parts that
 * decide correctness and write progress can be exercised end to end in a test.
 * `useQuest` is the thin hook that puts it on screen.
 *
 * Three promises, each deliberate:
 *
 * - Outcomes are applied through the engine's `recordTaskResult`, the function
 *   the simulation harness uses, so the pacing numbers measured there keep
 *   describing the real game.
 * - Progress is saved as each answer is recorded, not at the end. A
 *   five-year-old will be interrupted constantly, and losing five minutes to a
 *   sibling or a flat battery is what gets an app deleted.
 * - A wrong answer that is not yet abandoned leaves the child on the same task
 *   with more help, instead of moving them past something unlearnt.
 */
export class QuestRunner {
  private readonly config: EngineConfig;
  private readonly celebrateMs: number;

  private view: QuestView = LOADING;
  private readonly listeners = new Set<() => void>();

  private started = false;
  private busy = false;

  private session: ActiveSession | null = null;
  private mastery: MasteryMap = {};
  private confusions: ConfusionMap = {};
  private outcomes: QuestOutcomes = new Map();
  private tally: QuestTally = { errors: 0, scaffolds: 0 };
  private creaturesAtStart: string[] = [];
  /** Latched for the rest of the quest: the guard reports it once, on the answer that triggers it. */
  private maxDifficulty: number | null = null;
  /** The shortened length the guard asked for. Set by an abandon, consumed when the quest moves on. */
  private truncateTo: number | null = null;
  /** Attempts recorded in memory but not yet appended to the log. */
  private pendingAttempts: Attempt[] = [];

  private guard: FrustrationGuard;
  /** True once the answer has been shown on the current task. */
  private scaffolded = false;
  private shownAt = 0;

  constructor(private readonly deps: QuestDeps) {
    this.config = deps.config ?? DEFAULT_CONFIG;
    this.celebrateMs = deps.celebrateMs ?? 1400;
    this.guard = new FrustrationGuard(this.config);
  }

  // useSyncExternalStore wants these as stable functions.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getView = (): QuestView => this.view;

  /** Loads progress and shows the first task, resuming an interrupted quest if there is one. Safe to call twice. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.load();
    } catch (error) {
      console.error('Soundlings: could not start the quest', error);
      this.publish({ ...LOADING, status: 'error' });
    }
  }

  /**
   * The child's answer. Answers that arrive while an earlier one is still being
   * handled are dropped: a double tap must not be recorded twice, and the
   * second tap of a pair is aimed at a screen that has already moved on.
   */
  async answer(given: string): Promise<void> {
    if (this.busy || this.view.status !== 'playing') return;
    this.busy = true;
    try {
      await this.handle(given);
    } catch (error) {
      console.error('Soundlings: could not record an answer', error);
    } finally {
      this.busy = false;
    }
  }

  // --- loading ---------------------------------------------------------------

  private async load(): Promise<void> {
    const { profileId, level, repo, audio, now } = this.deps;
    const [mastery, confusions, active] = await Promise.all([
      repo.loadMastery(profileId),
      repo.loadConfusions(profileId),
      repo.loadActiveSession(profileId),
    ]);
    this.mastery = mastery;
    this.confusions = confusions;

    const resumed =
      active !== null &&
      active.level === level &&
      active.index < active.plan.length &&
      isPlayablePlan(active.plan)
        ? active
        : null;

    let current: ActiveSession;
    if (resumed) {
      const attempts = await repo.loadAttempts(profileId);
      const replayed = replayQuest(attempts, resumed.sessionId);
      this.outcomes = replayed.outcomes;
      this.tally = replayed.tally;
      this.creaturesAtStart = Array.isArray(resumed.creaturesAtStart)
        ? resumed.creaturesAtStart.filter((id): id is string => typeof id === 'string')
        : this.earnedCreatures(now());
      current = { ...resumed, creaturesAtStart: this.creaturesAtStart };
    } else {
      const startedAt = now();
      const sessionId = `${profileId}-${startedAt}`;
      this.creaturesAtStart = this.earnedCreatures(startedAt);
      current = {
        sessionId,
        level,
        plan: buildSession({
          sessionId,
          level,
          mastery,
          confusions,
          now: startedAt,
          config: this.config,
        }),
        index: 0,
        stars: 3,
        startedAt,
        creaturesAtStart: this.creaturesAtStart,
      };
    }

    // The closing swap is decided on arrival at the last task, which a resume
    // can be doing right now.
    current = this.withSwap(current);
    this.session = current;
    await this.persistSession(current);

    void audio.preload([
      ...PRAISE_KEYS,
      ...ENCOURAGE_KEYS,
      ...preloadKeysFor(current.plan.slice(current.index, current.index + 3)),
    ]);

    this.show(current);
  }

  // --- answering ---------------------------------------------------------------

  private async handle(given: string): Promise<void> {
    const { audio, now } = this.deps;
    const current = this.session;
    const task = current?.plan[current.index];
    if (!current || !task) return;

    const judgement = judgeAnswer(task, given);
    const at = now();
    const latencyMs = Math.max(0, at - this.shownAt);
    const base = { sessionId: current.sessionId, latencyMs, at };

    const chosen = confusionFor(task, judgement);
    if (chosen !== undefined) {
      this.confusions = recordConfusion(this.confusions, task.primaryTarget, chosen);
    }

    // What this tap means as evidence, if anything. Null means "keep trying":
    // the answer was shown and the child has not yet tapped it.
    let outcome: TaskOutcome | null;
    let finishesTask: boolean;
    let tier: HintTier = this.view.tier;
    let praised: Promise<void> = Promise.resolve();

    if (judgement.correct) {
      // Finishing a task with the answer shown does not clear the guard's
      // count, exactly as in the simulation: helped is not the same as learnt.
      if (!this.scaffolded) this.guard.record(task.primaryTarget, true);
      outcome = { ...base, correct: true, scaffolded: this.scaffolded };
      finishesTask = true;
      praised = audio.praise().catch(() => {});
    } else {
      const directive = this.guard.record(task.primaryTarget, false);
      void audio.encourage().catch(() => {});

      if (directive.abandon) {
        // Third error: stop asking. Recorded as scaffolded, which advances the
        // quest and proves nothing, so the data stays honest while the child
        // is let off.
        outcome = { ...base, correct: true, scaffolded: true };
        finishesTask = true;
        if (directive.capDifficulty !== null) this.maxDifficulty = directive.capDifficulty;
        this.truncateTo = directive.truncateTo;
      } else if (directive.scaffold) {
        // Second error: the answer is shown and the child taps it to continue.
        // Nothing is recorded yet; the completed task will be the scaffolded one.
        this.scaffolded = true;
        outcome = null;
        finishesTask = false;
        tier = 3;
      } else {
        outcome = { ...base, correct: false, scaffolded: false, ...(chosen === undefined ? {} : { chosen }) };
        finishesTask = false;
        tier = Math.max(tier, directive.hintTier) as HintTier;
      }
    }

    if (outcome !== null) this.record(task, outcome);
    // Written before anything else changes, so an interruption from here on
    // costs at most the pointer to the next task, never the evidence.
    await this.persistEvidence();

    if (!finishesTask) {
      this.shownAt = now();
      this.publish({ ...this.view, tier });
      return;
    }

    await this.advance(current, praised);
  }

  private record(task: TaskInstance, outcome: TaskOutcome): void {
    this.mastery = recordTaskResult(this.mastery, task, outcome, this.config);
    this.pendingAttempts.push(...attemptsForTask(task, outcome, this.config));

    const clean = outcome.correct && !outcome.scaffolded;
    noteOutcome(this.outcomes, task, clean);
    if (!outcome.correct) this.tally.errors += 1;
    if (outcome.scaffolded) this.tally.scaffolds += 1;
  }

  private async advance(current: ActiveSession, praised: Promise<void>): Promise<void> {
    const { repo, audio, now, level, profileId } = this.deps;

    let plan = current.plan;
    if (this.maxDifficulty !== null || this.truncateTo !== null) {
      plan = replanRemaining({
        plan,
        nextIndex: current.index + 1,
        sessionId: current.sessionId,
        level,
        mastery: this.mastery,
        confusions: this.confusions,
        now: now(),
        config: this.config,
        maxDifficulty: this.maxDifficulty,
        truncateTo: this.truncateTo,
      });
      this.truncateTo = null;
    }

    const nextIndex = current.index + 1;
    const stars = starsFor(this.tally);

    if (nextIndex >= plan.length) {
      this.session = { ...current, plan, index: nextIndex, stars };
      // The score first, then the session is cleared: an interruption between
      // the two replays the last task, which is harmless, where the other way
      // round would lose the score.
      await this.safely(() =>
        repo.saveHighScore(profileId, {
          level,
          stars,
          cleanRun: this.tally.errors === 0 && this.tally.scaffolds === 0,
          at: now(),
        }),
      );
      await this.safely(() => repo.saveActiveSession(profileId, null));
      const earned = this.earnedCreatures(now());
      const newCreatures = earned.filter((id) => !this.creaturesAtStart.includes(id));
      void praised.then(() => audio.say('ui.all_done')).catch(() => {});
      this.publish({
        status: 'finished',
        task: null,
        index: nextIndex,
        total: plan.length,
        tier: 0,
        stars,
        newCreatures,
      });
      return;
    }

    const next = this.withSwap({ ...current, plan, index: nextIndex, stars });
    this.session = next;
    // The pointer moves only now that the evidence is safe.
    await this.persistSession(next);

    void audio.preload(preloadKeysFor(next.plan.slice(nextIndex, nextIndex + 3)));

    // Give a right answer a moment to land before the screen changes under it.
    // A wrong-but-abandoned answer has nothing to celebrate, so it moves on.
    if (this.celebrateMs > 0) await this.settle(praised, this.celebrateMs);
    this.show(next);
  }

  private settle(clip: Promise<void>, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      void clip.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // --- persistence -------------------------------------------------------------

  /** Attempts, mastery and confusions, in that order. The log comes first because it is the source the rest can be rebuilt from. */
  private async persistEvidence(): Promise<void> {
    const { repo, profileId } = this.deps;
    const attempts = this.pendingAttempts;
    this.pendingAttempts = [];
    for (const attempt of attempts) await this.safely(() => repo.appendAttempt(profileId, attempt));
    await this.safely(() => repo.saveMastery(profileId, this.mastery));
    await this.safely(() => repo.saveConfusions(profileId, this.confusions));
  }

  private persistSession(session: ActiveSession): Promise<void> {
    return this.safely(() => this.deps.repo.saveActiveSession(this.deps.profileId, session));
  }

  /**
   * A storage failure must not stop a child playing: the quest carries on from
   * memory and the next successful write catches the repository up. It is
   * logged, because a silent failure here is the one that loses sessions.
   */
  private async safely(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      console.error('Soundlings: could not save progress', error);
    }
  }

  // --- helpers -------------------------------------------------------------------

  private earnedCreatures(at: number): string[] {
    return levelProgress(this.deps.level, this.mastery, at, this.config).creaturesEarned;
  }

  /** Applies the closing-anchor promise if `session` is at its final task. */
  private withSwap(session: ActiveSession): ActiveSession {
    const plan = applyClosingSwap(session.plan, session.index, this.outcomes);
    return plan.length === session.plan.length && plan.every((t, i) => t === session.plan[i])
      ? session
      : { ...session, plan };
  }

  private show(session: ActiveSession): void {
    this.scaffolded = false;
    this.shownAt = this.deps.now();
    this.publish({
      status: 'playing',
      task: session.plan[session.index],
      index: session.index,
      total: session.plan.length,
      tier: 0,
      stars: starsFor(this.tally),
      newCreatures: [],
    });
  }

  private publish(view: QuestView): void {
    this.view = view;
    for (const listener of [...this.listeners]) listener();
  }
}
