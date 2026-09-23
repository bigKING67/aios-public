import { Button, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  FileImageOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RobotOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { formatBytes, formatCompactNumber } from '../_lib/content-assets-formatters';
import type { ContentAssetSummary } from '../_lib/content-assets-types';
import styles from './content-assets-console.module.css';

export function ContentAssetsLibraryHeader({
  summary,
  isFetching,
  onRefresh,
}: {
  summary: ContentAssetSummary;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const statCards = [
    {
      label: '视频素材',
      value: formatCompactNumber(summary.totalAssets),
      helper: '全部素材',
      icon: <VideoCameraOutlined />,
    },
    {
      label: '已就绪',
      value: formatCompactNumber(summary.readyAssets),
      helper: '封面 / 预览已生成',
      icon: <AppstoreOutlined />,
    },
    {
      label: '待补源',
      value: formatCompactNumber(summary.externalOnlyAssets),
      helper: '外链素材待入库',
      icon: <FileImageOutlined />,
    },
    {
      label: '待生成',
      value: formatCompactNumber(summary.pendingAssets),
      helper: '原片已入库',
      icon: <FileTextOutlined />,
    },
    {
      label: '原片体积',
      value: formatBytes(summary.totalRawSizeBytes),
      helper: 'TOS 原片合计',
      icon: <RobotOutlined />,
    },
  ];

  return (
    <>
      <div className={styles.libraryHeader}>
        <div className={styles.libraryLead}>
          <div className={styles.libraryTitle}>
            <h1>素材库</h1>
            <Tooltip title="刷新素材库">
              <Button className={styles.viewButton} icon={<ReloadOutlined />} loading={isFetching} onClick={onRefresh} />
            </Tooltip>
          </div>
          <p>集中管理视频原片、预览视频、封面、平台视频 ID、广告素材 ID 与投放表现回流。</p>
        </div>
      </div>
      <section className={styles.statGrid} aria-label="素材库概览">
        {statCards.map((card) => (
          <article key={card.label} className={styles.statCard}>
            <div className={styles.statIcon}>{card.icon}</div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.helper}</p>
          </article>
        ))}
      </section>
    </>
  );
}
