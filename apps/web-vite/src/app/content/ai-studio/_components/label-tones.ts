import timeline from './segment-timeline.module.css';

/** Timeline label tones by preset order: blue, teal, amber, rose (DESIGN.md › 片段标注). */
export type Tone = 2 | 3 | 4 | 5 | 'muted';

const TONES: readonly Tone[] = [4, 2, 3, 5];

export const TONE_CLASSES: Record<string, string | undefined> = {
  2: timeline.tone2,
  3: timeline.tone3,
  4: timeline.tone4,
  5: timeline.tone5,
  muted: timeline.toneMuted,
};

export function toneOf(order: readonly string[], key: string): Tone {
  const index = order.indexOf(key);
  return index >= 0 ? TONES[index % TONES.length] : 'muted';
}

/** The tone class of a preset label (by its place in the preset), for markers outside the timeline. */
export function labelToneClass(order: readonly string[], key: string): string | undefined {
  return TONE_CLASSES[toneOf(order, key)];
}
