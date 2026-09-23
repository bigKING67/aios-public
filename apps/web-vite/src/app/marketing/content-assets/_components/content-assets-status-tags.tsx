import { Tag } from 'antd';

const ASSET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ready: { label: '已就绪', color: 'green' },
  external_only: { label: '待补源', color: 'orange' },
  pending_processing: { label: '待生成', color: 'blue' },
  processing: { label: '处理中', color: 'processing' },
  failed: { label: '失败', color: 'red' },
  archived: { label: '已归档', color: 'default' },
};

const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  active: '启用中',
  draft: '草稿',
  waiting_analysis: '待分析',
  testable: '可测试',
  testing: '投放中',
  scaling: '已放量',
  repurpose: '待复剪',
  rejected: '已淘汰',
  expired: '授权到期',
};

export function AssetStatusTag({ value }: { value: string }) {
  const status = ASSET_STATUS_LABELS[value] || { label: value || '--', color: 'default' };
  return <Tag color={status.color}>{status.label}</Tag>;
}

export function LifecycleStatusTag({ value }: { value: string }) {
  return <Tag>{LIFECYCLE_STATUS_LABELS[value] || value || '--'}</Tag>;
}
