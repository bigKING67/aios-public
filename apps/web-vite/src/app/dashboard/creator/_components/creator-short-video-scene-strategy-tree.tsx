'use client';

import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useRef, useState, type Key } from 'react';
import type { DateRange } from './creator-date-range';
import { creatorDetailTableComponents } from './creator-detail-table-components';
import {
  formatCreatorCurrencyCell,
  formatCreatorIntegerCell,
  formatRate,
} from './creator-formatters';
import { formatShortVideoRoi } from './creator-short-video-metrics';
import {
  buildCreatorShortVideoSceneStrategyTree,
  buildTreeSignature,
  collectDefaultExpandedRowKeys,
  ORDERED_VIDEO_COUNT_HELP,
  type SceneStrategyTreeRow,
} from './creator-short-video-scene-strategy-model';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import { useResolvedTableScrollX } from './creator-table-scroll';
import { renderCreatorNumericText } from './creator-table-renderers';
import liveStyles from './creator-live-dashboard.module.css';
import styles from './creator-short-video-scene-strategy-tree.module.css';

interface CreatorShortVideoSceneStrategyTreeProps {
  rows: readonly CreatorShortVideoDetailRow[];
  currentRange: DateRange;
  loading: boolean;
}

function renderSceneStrategyName(row: SceneStrategyTreeRow) {
  const className = [
    styles.sceneStrategyName,
    row.isFallback ? styles.sceneStrategyNameMuted : undefined,
  ].filter(Boolean).join(' ');
  const badgeClassName = [
    styles.sceneStrategyLevelBadge,
    styles[`sceneStrategyLevelBadge${row.level[0].toUpperCase()}${row.level.slice(1)}`],
  ].filter(Boolean).join(' ');

  return (
    <span className={className} title={row.displayPath} aria-label={`${row.levelLabel}：${row.displayPath}`}>
      <span className={badgeClassName}>{row.levelLabel}</span>
      <span className={styles.sceneStrategyLabelStack}>
        <span className={styles.sceneStrategyLabelText}>{row.label}</span>
      </span>
    </span>
  );
}

function renderNumber(value: number): string {
  return formatCreatorIntegerCell(value);
}

function renderNumberText(value: number) {
  return renderCreatorNumericText(renderNumber(value));
}

function renderCurrencyText(value: number) {
  return renderCreatorNumericText(formatCreatorCurrencyCell(value));
}

function renderRoiText(value: number | null) {
  return renderCreatorNumericText(formatShortVideoRoi(value));
}

function renderShare(value: number, total: number) {
  if (total <= 0) {
    return '--';
  }

  const share = value / total;
  const percent = Math.max(0, Math.min(100, share * 100));

  return (
    <div className={styles.sceneStrategyShareCell}>
      <span>{renderCreatorNumericText(formatRate(share, 1))}</span>
      <progress
        className={styles.sceneStrategyProgress}
        value={percent}
        max={100}
        aria-label={`占比 ${formatRate(share, 1)}`}
      />
    </div>
  );
}

function buildSceneStrategyColumns(totalQianchuanGsv: number): ColumnsType<SceneStrategyTreeRow> {
  return [
    {
      title: '场景',
      key: 'label',
      width: 250,
      fixed: 'left',
      render: (_value: unknown, row) => renderSceneStrategyName(row),
    },
    {
      title: '总视频数',
      key: 'totalVideoCount',
      align: 'right',
      width: 80,
      render: (_value: unknown, row) => renderNumberText(row.metrics.totalVideoCount),
    },
    {
      title: '新视频数',
      key: 'newVideoCount',
      align: 'right',
      width: 80,
      render: (_value: unknown, row) => renderNumberText(row.metrics.newVideoCount),
    },
    {
      title: <span title={ORDERED_VIDEO_COUNT_HELP}>出单数</span>,
      key: 'orderedVideoCount',
      align: 'right',
      width: 76,
      render: (_value: unknown, row) => renderNumberText(row.metrics.orderedVideoCount),
    },
    {
      title: '出单率',
      key: 'orderRate',
      align: 'right',
      width: 88,
      render: (_value: unknown, row) => formatRate(row.metrics.orderRate, 1),
    },
    {
      title: '千川GMV',
      key: 'qianchuanGmv',
      align: 'right',
      width: 112,
      render: (_value: unknown, row) => renderCurrencyText(row.metrics.qianchuanGmv),
    },
    {
      title: '千川GSV',
      key: 'qianchuanGsv',
      align: 'right',
      width: 112,
      render: (_value: unknown, row) => renderCurrencyText(row.metrics.qianchuanGsv),
    },
    {
      title: '千川消耗',
      key: 'qianchuanCost',
      align: 'right',
      width: 112,
      render: (_value: unknown, row) => renderCurrencyText(row.metrics.qianchuanCost),
    },
    {
      title: '千川订单',
      key: 'qianchuanOrderCount',
      align: 'right',
      width: 96,
      render: (_value: unknown, row) => renderNumberText(row.metrics.qianchuanOrderCount),
    },
    {
      title: '千川ROI',
      key: 'qianchuanRoi',
      align: 'right',
      width: 88,
      render: (_value: unknown, row) => renderRoiText(row.metrics.qianchuanRoi),
    },
    {
      title: '挂车GMV',
      key: 'cartGmv',
      align: 'right',
      width: 112,
      render: (_value: unknown, row) => renderCurrencyText(row.metrics.cartGmv),
    },
    {
      title: '挂车GSV',
      key: 'cartGsv',
      align: 'right',
      width: 124,
      render: (_value: unknown, row) => renderCurrencyText(row.metrics.cartGsv),
    },
    {
      title: '千川GSV占比',
      key: 'qianchuanGsvShare',
      align: 'right',
      width: 156,
      render: (_value: unknown, row) => renderShare(row.metrics.qianchuanGsv, totalQianchuanGsv),
    },
  ];
}

export function CreatorShortVideoSceneStrategyTree({
  rows,
  currentRange,
  loading,
}: CreatorShortVideoSceneStrategyTreeProps) {
  const { treeRows, totalMetrics } = useMemo(
    () => buildCreatorShortVideoSceneStrategyTree(rows, currentRange),
    [currentRange, rows]
  );
  const columns = useMemo(
    () => buildSceneStrategyColumns(totalMetrics.qianchuanGsv),
    [totalMetrics.qianchuanGsv]
  );
  const tableScrollX = useResolvedTableScrollX(columns);
  const defaultExpandedRowKeys = useMemo(() => collectDefaultExpandedRowKeys(treeRows), [treeRows]);
  const treeSignature = useMemo(() => buildTreeSignature(treeRows), [treeRows]);
  const rangeSignature = `${currentRange.start.format('YYYY-MM-DD')}::${currentRange.end.format('YYYY-MM-DD')}`;
  const resetSignature = `${rangeSignature}::${treeSignature}`;
  const lastResetSignatureRef = useRef<string | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>(defaultExpandedRowKeys);

  useEffect(() => {
    if (lastResetSignatureRef.current !== resetSignature) {
      setExpandedRowKeys(defaultExpandedRowKeys);
      lastResetSignatureRef.current = resetSignature;
    }
  }, [defaultExpandedRowKeys, resetSignature]);

  return (
    <section className={styles.sceneStrategyPanel}>
      <header className={styles.sceneStrategyHead}>
        <div className={styles.sceneStrategyMeta}>
          <h3>短视频场景策略表现</h3>
          <p>
            备注：按场景类型、大场景、细分场景逐级聚合；标签里的“/”仅作为业务词组保留。千川指标为素材广告归因，挂车指标为罗盘末次成交归因；视频数、新视频数、出单视频数均只按视频ID去重，未匹配到视频ID的千川素材仅贡献千川GMV/GSV/消耗/订单数/ROI，不增加视频类数量。
          </p>
        </div>
      </header>

      <Table<SceneStrategyTreeRow>
        className={`${liveStyles.detailTable} ${styles.sceneStrategyTable}`}
        components={creatorDetailTableComponents}
        columns={columns}
        dataSource={treeRows}
        loading={loading}
        size="small"
        pagination={false}
        rowKey="key"
        rowClassName={(row) => styles[`sceneStrategyRow${row.level[0].toUpperCase()}${row.level.slice(1)}`]}
        scroll={{ x: tableScrollX, y: 520 }}
        expandable={{
          childrenColumnName: 'children',
          expandedRowKeys,
          expandRowByClick: true,
          // AntD renders this indent before the expand icon, so icon + badge + label move together.
          indentSize: 32,
          onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          rowExpandable: (row) => Boolean(row.children?.length),
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前区间暂无可聚合的场景策略数据"
            />
          ),
        }}
      />
    </section>
  );
}
