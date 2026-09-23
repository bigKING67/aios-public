'use client';

import type { ColumnsType } from 'antd/es/table';
import {
  CreatorCooperationStatusBadge,
  type CreatorCooperationStatusRecord,
} from './creator-cooperation-status-badge';
import { formatCreatorTextCell } from './creator-formatters';
import {
  renderCreatorIdText,
  renderCreatorNumericText,
  renderCreatorStatusDescText,
} from './creator-table-renderers';

export interface CreatorAnchorLevelDetailColumnRecord extends CreatorCooperationStatusRecord {
  influencer_name: string;
  influencer_id: string | null;
  anchor_desc: string | null;
  anchor_level: string | null;
  platform: string | null;
  main_platform_fans: string | null;
  sales_30d: string | null;
  sales_90d: string | null;
  cooperation_desc: string | null;
  owner_name: string | null;
}

export interface BuildCreatorAnchorLevelDetailColumnsParams {
  numericCellClassName: string;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

export function buildCreatorAnchorLevelDetailColumns<
  TRecord extends CreatorAnchorLevelDetailColumnRecord,
>({
  numericCellClassName,
  resolveStageKey,
  formatDisplay,
}: BuildCreatorAnchorLevelDetailColumnsParams): ColumnsType<TRecord> {
  return [
    {
      title: '达人名称',
      dataIndex: 'influencer_name',
      width: 180,
      fixed: 'left',
      render: formatCreatorTextCell,
    },
    {
      title: '达人ID',
      dataIndex: 'influencer_id',
      width: 160,
      render: renderCreatorIdText,
    },
    {
      title: '主播描述',
      dataIndex: 'anchor_desc',
      width: 200,
      render: formatCreatorTextCell,
    },
    {
      title: '主播等级',
      dataIndex: 'anchor_level',
      width: 110,
      render: formatCreatorTextCell,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 120,
      render: formatCreatorTextCell,
    },
    {
      title: '主平台粉丝数',
      dataIndex: 'main_platform_fans',
      width: 140,
      onCell: () => ({ className: numericCellClassName }),
      render: renderCreatorNumericText,
    },
    {
      title: '近30天销售额',
      dataIndex: 'sales_30d',
      width: 140,
      onCell: () => ({ className: numericCellClassName }),
      render: renderCreatorNumericText,
    },
    {
      title: '近90天销售额',
      dataIndex: 'sales_90d',
      width: 140,
      onCell: () => ({ className: numericCellClassName }),
      render: renderCreatorNumericText,
    },
    {
      title: '合作状态',
      dataIndex: 'cooperation_status',
      width: 138,
      render: (_value: string | null, row) => (
        <CreatorCooperationStatusBadge
          record={row}
          resolveStageKey={resolveStageKey}
          formatDisplay={formatDisplay}
        />
      ),
    },
    {
      title: '合作描述',
      dataIndex: 'cooperation_desc',
      width: 220,
      render: renderCreatorStatusDescText,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 130,
      render: formatCreatorTextCell,
    },
  ];
}
