'use client';

import { Tooltip } from 'antd';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import { joinTableList } from './dataops-hub-formatters';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsPipelineExpandedRowProps {
  record: DataOpsRuntimePipeline;
}

interface PipelineFieldOptions {
  tooltip?: string;
  mono?: boolean;
  multiline?: boolean;
}

function renderPipelineField(label: string, value: string, options?: PipelineFieldOptions) {
  const normalizedValue = value.trim() ? value : '-';
  const tooltipText = (options?.tooltip || normalizedValue).trim();
  const valueClassName = options?.multiline
    ? pipelineStyles.pipelineKvValueMultiline
    : pipelineStyles.pipelineKvValue;
  const content = options?.mono ? (
    <code className={`${pipelineStyles.inlineCode} ${pipelineStyles.pipelineInlineCode} ${valueClassName}`}>
      {normalizedValue}
    </code>
  ) : (
    <span className={valueClassName}>{normalizedValue}</span>
  );

  return (
    <div className={pipelineStyles.pipelineKvItem}>
      <span className={pipelineStyles.pipelineKvLabel}>{label}</span>
      {tooltipText && tooltipText !== '-' ? <Tooltip title={tooltipText}>{content}</Tooltip> : content}
    </div>
  );
}

export function DataOpsPipelineExpandedRow({ record }: DataOpsPipelineExpandedRowProps) {
  const operationError = record.runtime?.operationError?.trim() || '';
  const flowStatusText = record.runtime?.flowRunStateName || record.runtime?.flowRunStateType || '-';

  return (
    <div className={pipelineStyles.pipelineExpandPanel}>
      <div className={pipelineStyles.pipelineExpandGrid}>
        <section className={pipelineStyles.pipelineExpandSection}>
          <h4>编排配置</h4>
          <div className={pipelineStyles.pipelineKvList}>
            {renderPipelineField('Flow', record.flowName)}
            {renderPipelineField('Deployment', record.deploymentName)}
            {renderPipelineField('Cron', `${record.cron} (${record.timezone})`)}
            {record.linuxDeployScript
              ? renderPipelineField('Linux脚本', record.linuxDeployScript, { mono: true })
              : null}
            {record.linuxDeployCommand
              ? renderPipelineField('执行命令', record.linuxDeployCommand, { mono: true })
              : null}
          </div>
        </section>
        <section className={pipelineStyles.pipelineExpandSection}>
          <h4>同步映射</h4>
          <div className={pipelineStyles.pipelineKvList}>
            {renderPipelineField('源表', joinTableList(record.sourceTables), {
              tooltip: record.sourceTables.join(' / ') || '-',
              multiline: true,
            })}
            {renderPipelineField('目标表', joinTableList(record.targetTables), {
              tooltip: record.targetTables.join(' / ') || '-',
              multiline: true,
            })}
            {renderPipelineField('过程', joinTableList(record.procedures), {
              tooltip: record.procedures.join(' / ') || '-',
              multiline: true,
            })}
          </div>
        </section>
        <section className={`${pipelineStyles.pipelineExpandSection} ${pipelineStyles.pipelineExpandSectionWide}`}>
          <h4>运行状态</h4>
          <div className={pipelineStyles.pipelineKvList}>
            {renderPipelineField('Flow状态', flowStatusText)}
            {renderPipelineField(
              '平均耗时',
              Number.isFinite(record.avgDurationSec) ? `${record.avgDurationSec}s` : '-'
            )}
            {operationError ? (
              <div className={pipelineStyles.pipelineKvItem}>
                <span className={pipelineStyles.pipelineKvLabel}>错误详情</span>
                <p className={pipelineStyles.pipelineErrorDetail}>{operationError}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
