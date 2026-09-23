import type { ReactNode } from 'react';
import { WeeklyBlockDescription, WeeklyBlockHeader } from './weekly-text';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-modern.module.css';

export interface WeeklySectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  spacing?: 'default' | 'relaxed';
  className?: string;
  titleAccessory?: ReactNode;
  titleRowClassName?: string;
}

const headerSpacingClassName: Record<
  NonNullable<WeeklySectionHeaderProps['spacing']>,
  string | undefined
> = {
  default: undefined,
  relaxed: styles.blockHeaderRelaxed,
};

export function WeeklySectionHeader({
  title,
  description,
  badge,
  spacing = 'default',
  className,
  titleAccessory,
  titleRowClassName,
}: WeeklySectionHeaderProps) {
  const accessoryNode =
    badge !== undefined ? (
      <span className={styles.sectionTitleBadge}>{badge}</span>
    ) : (
      titleAccessory
    );
  const resolvedTitleRowClassName =
    badge !== undefined ? styles.sectionTitleRow : titleRowClassName;

  const titleNode = accessoryNode ? (
    <div className={resolvedTitleRowClassName}>
      <h2 className={styles.blockTitle}>{title}</h2>
      {accessoryNode}
    </div>
  ) : (
    <h2 className={styles.blockTitle}>{title}</h2>
  );

  return (
    <WeeklyBlockHeader
      className={mergeWeeklyClassNames(
        headerSpacingClassName[spacing],
        className,
      )}
    >
      {titleNode}
      {description ? (
        <WeeklyBlockDescription>{description}</WeeklyBlockDescription>
      ) : null}
    </WeeklyBlockHeader>
  );
}
