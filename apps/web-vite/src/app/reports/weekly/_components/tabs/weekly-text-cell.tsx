import styles from './weekly-table.module.css';

export interface WeeklyPlainTextCellProps {
  children: string;
  variant?: 'reason' | 'goods-id' | 'goods-name';
}

export function WeeklyPlainTextCell({
  children,
  variant = 'reason',
}: WeeklyPlainTextCellProps) {
  const className =
    variant === 'goods-id'
      ? styles.goodsIdText
      : variant === 'goods-name'
        ? styles.goodsNameText
        : styles.reasonText;

  return (
    <div className={className} title={children}>
      {children}
    </div>
  );
}
