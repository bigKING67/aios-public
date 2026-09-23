import type { DataOpsStatus } from '@/config/dataops-hub';
import styles from './dataops-hub.module.css';

const STATUS_TEXT: Record<DataOpsStatus, string> = {
  healthy: '健康',
  warning: '关注',
  error: '异常',
  paused: '停用',
};

function statusClassName(status: DataOpsStatus): string {
  return `${styles.statusTag} ${styles[`status_${status}`]}`;
}

export function DataOpsStatusTag({ status }: { status: DataOpsStatus }) {
  return <span className={statusClassName(status)}>{STATUS_TEXT[status]}</span>;
}
