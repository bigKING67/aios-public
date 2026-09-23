import type { ReactNode } from 'react';
import { Alert, Empty } from 'antd';

import { resolveClientErrorMessage } from '@/lib/client-error';
import styles from '../sample-inventory.module.css';

type SampleInventoryDataStateProps = {
  error: unknown;
  empty: boolean;
  children: ReactNode;
};

export function SampleInventoryDataState({
  error,
  empty,
  children,
}: SampleInventoryDataStateProps) {
  if (error) {
    return (
      <Alert
        className={styles.errorPanel}
        type="error"
        showIcon
        title="数据加载失败"
        description={resolveClientErrorMessage(error, '请检查网络或服务状态后重试。')}
      />
    );
  }
  if (empty) {
    return <Empty className={styles.emptyState} description="当前条件下暂无记录" />;
  }
  return <>{children}</>;
}
