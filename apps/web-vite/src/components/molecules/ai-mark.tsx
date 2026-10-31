import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './ai-grammar.module.css';

export interface AiMarkProps {
  /** What AI produced, e.g. 「AI 标注 · 妆效」. Defaults to 「AI」. */
  children?: ReactNode;
  /** A person confirmed the AI output: the mark turns into a neutral 人工确认 chip. */
  confirmed?: boolean;
  /** Provenance shown on hover, e.g. model and time. */
  title?: string;
}

/** Marks anything AI produced (DESIGN.md Visual Language v2 › AI Grammar). */
export function AiMark({ children, confirmed = false, title }: AiMarkProps) {
  if (confirmed) {
    return (
      <span className={`${styles.mark} ${styles.markConfirmed}`} title={title}>
        人工确认
      </span>
    );
  }
  return (
    <span className={styles.mark} title={title}>
      <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />
      {children ?? 'AI'}
    </span>
  );
}
