import type { ComponentType } from 'react';
import { PictureMatch } from './PictureMatch';
import { SoundHunt } from './SoundHunt';
import { SoundSinger } from './SoundSinger';
import { WordBuilder } from './WordBuilder';
import type { TaskProps } from './TaskProps';

/**
 * Maps the engine's task-type ids to components. This is the only place the
 * pure engine and the React layer meet — the engine schedules by id and never
 * knows a component exists.
 */
export const TASK_COMPONENTS: Record<string, ComponentType<TaskProps>> = {
  'sound-hunt': SoundHunt,
  'sound-singer': SoundSinger,
  'picture-match': PictureMatch,
  'word-builder': WordBuilder,
};

export function componentFor(taskTypeId: string): ComponentType<TaskProps> {
  const component = TASK_COMPONENTS[taskTypeId];
  if (!component) throw new Error(`No component registered for task type: ${taskTypeId}`);
  return component;
}
