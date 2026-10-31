import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { type LabelToneSeries, labelToneSeries } from '../_lib/segment-display';
import styles from './segment-timeline.module.css';

const TONE_CLASSES: Record<LabelToneSeries, string | undefined> = {
  2: styles.tone2,
  3: styles.tone3,
  4: styles.tone4,
  5: styles.tone5,
  muted: styles.toneMuted,
};

/** A label's block tone on any timeline (blue, teal, amber, rose by preset order). */
export function labelToneClass(preset: StudioSegmentPreset | undefined, labelKey: string): string | undefined {
  return TONE_CLASSES[labelToneSeries(preset, labelKey)];
}
