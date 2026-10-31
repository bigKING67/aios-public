import { Button, type ButtonProps } from '@lobehub/ui';
import { Sparkles } from 'lucide-react';
import styles from './ai-grammar.module.css';

export type AiActionButtonProps = Omit<ButtonProps, 'type' | 'danger' | 'ghost' | 'icon'> & {
  /** Outlined with a violet ✦, for the same AI action repeated per row or card. */
  quiet?: boolean;
};

/**
 * The button that starts AI work (✦ 生成, 合成, 开始分析): AI violet fill, at most one per screen.
 * Repeated per-row starts use `quiet`. Human actions keep the ink primary Button
 * (DESIGN.md Visual Language v2 › AI Grammar).
 */
export function AiActionButton({ className, children, quiet = false, ...rest }: AiActionButtonProps) {
  const variant = quiet ? styles.actionButtonQuiet : styles.actionButton;
  return (
    <Button
      {...rest}
      type={quiet ? 'default' : 'primary'}
      icon={<Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />}
      className={className ? `${variant} ${className}` : variant}
    >
      {children}
    </Button>
  );
}
