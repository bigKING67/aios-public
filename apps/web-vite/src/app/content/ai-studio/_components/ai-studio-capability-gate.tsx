import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';
import { Badge } from '@/components/atoms/badge';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { useStudioCapabilities } from './use-ai-studio-queries';
import styles from '../ai-studio.module.css';

export interface AiStudioCapabilityGateProps {
  title: string;
  purpose: string;
  children: (capabilities: StudioCapabilitiesResponse) => ReactNode;
}

/**
 * Reads studio capabilities before rendering a data page. A disabled studio
 * renders an honest read-only notice and never mounts write controls.
 */
export function AiStudioCapabilityGate({ title, purpose, children }: AiStudioCapabilityGateProps) {
  const query = useStudioCapabilities();

  if (query.isPending) {
    return (
      <section className={styles.panel} aria-labelledby="ai-studio-page-title" aria-busy="true">
        <GateHeader title={title} purpose={purpose} />
        <div className={styles.card}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className={styles.panel} aria-labelledby="ai-studio-page-title">
        <GateHeader title={title} purpose={purpose} />
        <Alert
          type="error"
          showIcon
          title="无法读取 AI 创作中心状态"
          description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      </section>
    );
  }

  if (!query.data.enabled) {
    return (
      <section className={styles.panel} aria-labelledby="ai-studio-page-title">
        <GateHeader title={title} purpose={purpose} badge={<Badge status="neutral">尚未启用</Badge>} />
        <article className={styles.card}>
          <h2>AI 创作中心尚未启用</h2>
          <p>当前环境没有开启片段与混剪能力，这里不会展示或修改任何片段数据。开启后刷新页面即可使用。</p>
        </article>
      </section>
    );
  }

  return <>{children(query.data)}</>;
}

function GateHeader({ title, purpose, badge }: { title: string; purpose: string; badge?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 id="ai-studio-page-title">{title}</h1>
        <p>{purpose}</p>
      </div>
      {badge}
    </header>
  );
}
