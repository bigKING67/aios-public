'use client';

import { InputNumber, Switch } from 'antd';
import {
  NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX,
  NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN,
  NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT,
  NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT,
  NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS,
  NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS,
} from './dataops-hub-formatters';
import { clampIntegerValue } from './dataops-trigger-helpers';
import batchResultStyles from './dataops-batch-result.module.css';

interface DataOpsNotificationTraceSloScanControlsProps {
  dryRun: boolean;
  running: boolean;
  lookbackHours: number;
  maxGroups: number;
  concurrency: number;
  onDryRunChange: (value: boolean) => void;
  onLookbackHoursChange: (value: number) => void;
  onMaxGroupsChange: (value: number) => void;
  onConcurrencyChange: (value: number) => void;
}

export function DataOpsNotificationTraceSloScanControls({
  dryRun,
  running,
  lookbackHours,
  maxGroups,
  concurrency,
  onDryRunChange,
  onLookbackHoursChange,
  onMaxGroupsChange,
  onConcurrencyChange,
}: DataOpsNotificationTraceSloScanControlsProps) {
  return (
    <div className={batchResultStyles.batchResultControls}>
      <span className={batchResultStyles.batchHistoryStatsText}>巡检模式</span>
      <Switch
        size="small"
        checked={dryRun}
        disabled={running}
        checkedChildren="Dry Run"
        unCheckedChildren="Enforce"
        onChange={onDryRunChange}
      />
      <span className={batchResultStyles.batchHistoryStatsText}>
        {dryRun ? '仅评估，不写审计、不触发自动告警' : '执行动作，写审计并按配置触发SLO告警'}
      </span>
      <InputNumber
        size="small"
        min={NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS}
        max={NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS}
        precision={0}
        step={1}
        disabled={running}
        value={lookbackHours}
        onChange={(value) => {
          onLookbackHoursChange(
            clampIntegerValue(value, 24, {
              min: NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS,
              max: NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS,
            })
          );
        }}
        addonBefore="回看"
        addonAfter="小时"
      />
      <InputNumber
        size="small"
        min={NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT}
        max={NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT}
        precision={0}
        step={1}
        disabled={running}
        value={maxGroups}
        onChange={(value) => {
          onMaxGroupsChange(
            clampIntegerValue(value, 30, {
              min: NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT,
              max: NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT,
            })
          );
        }}
        addonBefore="最多"
        addonAfter="组"
      />
      <InputNumber
        size="small"
        min={NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN}
        max={NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX}
        precision={0}
        step={1}
        disabled={running}
        value={concurrency}
        onChange={(value) => {
          onConcurrencyChange(
            clampIntegerValue(value, 4, {
              min: NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN,
              max: NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX,
            })
          );
        }}
        addonBefore="并发"
      />
    </div>
  );
}
