'use client';

import type { ReactNode } from 'react';
import {
  formatCreatorTextCell,
  formatCurrency,
  formatRate,
  type NumericInput,
} from './creator-formatters';
import {
  CreatorCooperationStatusBadge,
  type CreatorCooperationStatusRecord,
} from './creator-cooperation-status-badge';
import { CreatorStatusDescText } from './creator-status-desc-text';
import styles from './creator-status.module.css';

type CreatorStatusMetricKey = 'gmv' | 'gsv' | 'refundRate';

interface CreatorStatusMetricDefinition {
  key: CreatorStatusMetricKey;
  label: string;
  format: (value: NumericInput) => string;
}

const CREATOR_STATUS_METRIC_DEFINITIONS: CreatorStatusMetricDefinition[] = [
  { key: 'gmv', label: 'GMV', format: (value) => formatCurrency(value, 2) },
  { key: 'gsv', label: 'GSV', format: (value) => formatCurrency(value, 2) },
  { key: 'refundRate', label: '退款率', format: (value) => formatRate(value, 2) },
];

export interface CreatorStatusTableTextCellProps {
  value?: string | null;
}

export function CreatorStatusTableTextCell({ value }: CreatorStatusTableTextCellProps) {
  return <td>{formatCreatorTextCell(value)}</td>;
}

export interface CreatorStatusTableIdentityRecord {
  influencer_name: string | null;
  influencer_id: string | null;
  platform: string | null;
  owner_name: string | null;
}

export interface CreatorStatusTableIdentityCellsProps {
  record: CreatorStatusTableIdentityRecord;
  normalizePlatform: (value: string | null) => string;
}

export function CreatorStatusTableIdentityCells({
  record,
  normalizePlatform,
}: CreatorStatusTableIdentityCellsProps) {
  return (
    <>
      <CreatorStatusTableTextCell value={record.influencer_name} />
      <CreatorStatusTableTextCell value={record.influencer_id} />
      <td>{normalizePlatform(record.platform)}</td>
      <CreatorStatusTableTextCell value={record.owner_name} />
    </>
  );
}

export interface CreatorStatusTableStageCellProps {
  record: CreatorCooperationStatusRecord;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

export function CreatorStatusTableStageCell({
  record,
  resolveStageKey,
  formatDisplay,
}: CreatorStatusTableStageCellProps) {
  return (
    <td>
      <CreatorCooperationStatusBadge
        record={record}
        displayOrder="normalized-first"
        resolveStageKey={resolveStageKey}
        formatDisplay={formatDisplay}
      />
    </td>
  );
}

export interface CreatorStatusTableDescriptionCellProps {
  value?: string | null;
}

export function CreatorStatusTableDescriptionCell({ value }: CreatorStatusTableDescriptionCellProps) {
  return (
    <td>
      <CreatorStatusDescText value={value} preserveEmptyContainer />
    </td>
  );
}

export interface CreatorStatusTableNumericCellProps {
  children: ReactNode;
}

export function CreatorStatusTableNumericCell({ children }: CreatorStatusTableNumericCellProps) {
  return <td className={styles.statusTableNumeric}>{children}</td>;
}

export interface CreatorStatusTableNumericHeadProps {
  children: ReactNode;
}

export function CreatorStatusTableNumericHead({ children }: CreatorStatusTableNumericHeadProps) {
  return <th className={styles.statusTableNumericHead}>{children}</th>;
}

export function CreatorStatusTableMetricHeads() {
  return (
    <>
      {CREATOR_STATUS_METRIC_DEFINITIONS.map((metric) => (
        <CreatorStatusTableNumericHead key={metric.key}>{metric.label}</CreatorStatusTableNumericHead>
      ))}
    </>
  );
}

export interface CreatorStatusTableMetricCellsProps {
  gmv: NumericInput;
  gsv: NumericInput;
  refundRate: NumericInput;
}

export function CreatorStatusTableMetricCells({ gmv, gsv, refundRate }: CreatorStatusTableMetricCellsProps) {
  const values: Record<CreatorStatusMetricKey, NumericInput> = { gmv, gsv, refundRate };

  return (
    <>
      {CREATOR_STATUS_METRIC_DEFINITIONS.map((metric) => (
        <CreatorStatusTableNumericCell key={metric.key}>
          {metric.format(values[metric.key])}
        </CreatorStatusTableNumericCell>
      ))}
    </>
  );
}
