'use client';

import { Button, Empty, Table, type TableColumnsType } from '@lobehub/ui';
import type { DataOpsAuditEvent } from '@/config/dataops-hub';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import {
  getAuditResultFilterLabel,
  getAuditTimeRangeFilterLabel,
  type AuditResultFilter,
  type AuditTimeRangeFilter,
} from './dataops-hub-formatters';
import auditStyles from './dataops-audit-toolbar.module.css';
import styles from './dataops-hub.module.css';

interface DataOpsAuditDetailProps {
  auditEvents: DataOpsAuditEvent[];
  filteredAudits: DataOpsAuditEvent[];
  auditResultFilter: AuditResultFilter;
  auditTimeRangeFilter: AuditTimeRangeFilter;
  auditActionFilter: string;
  auditActionOptions: Array<{ label: string; value: string }>;
  isAuditFailedOnly: boolean;
  isAudit24hFailed: boolean;
  isAudit7dFailed: boolean;
  columns: TableColumnsType<DataOpsAuditEvent>;
  isCompactViewport: boolean;
  onResultFilterChange: (value: AuditResultFilter) => void;
  onTimeRangeFilterChange: (value: AuditTimeRangeFilter) => void;
  onActionFilterChange: (value: string) => void;
  onResetFilters: () => void;
  onApplyFailedOnly: () => void;
  onApply24hFailed: () => void;
  onApply7dFailed: () => void;
  renderPaginationTotal: (total: number, range: [number, number]) => string;
}

export function DataOpsAuditDetail({
  auditEvents,
  filteredAudits,
  auditResultFilter,
  auditTimeRangeFilter,
  auditActionFilter,
  auditActionOptions,
  isAuditFailedOnly,
  isAudit24hFailed,
  isAudit7dFailed,
  columns,
  isCompactViewport,
  onResultFilterChange,
  onTimeRangeFilterChange,
  onActionFilterChange,
  onResetFilters,
  onApplyFailedOnly,
  onApply24hFailed,
  onApply7dFailed,
  renderPaginationTotal,
}: DataOpsAuditDetailProps) {
  if (!auditEvents.length) {
    return <Empty description="暂无运行审计记录" />;
  }

  return (
    <>
      <div className={auditStyles.auditToolbar}>
        <div className={auditStyles.auditFilterGroup}>
          <LabeledSelect<AuditResultFilter>
            label="审计结果"
            size="small"
            value={auditResultFilter}
            onChange={(value) => value && onResultFilterChange(value)}
            options={[
              { label: '全部结果', value: 'all' },
              { label: '成功', value: '成功' },
              { label: '失败', value: '失败' },
            ]}
            wrapperClassName={auditStyles.auditFilterSelect}
          />
          <LabeledSelect<AuditTimeRangeFilter>
            label="审计时间范围"
            size="small"
            value={auditTimeRangeFilter}
            onChange={(value) => value && onTimeRangeFilterChange(value)}
            options={[
              { label: '全部时间', value: 'all' },
              { label: '近 24 小时', value: '24h' },
              { label: '近 7 天', value: '7d' },
            ]}
            wrapperClassName={auditStyles.auditFilterSelect}
          />
          <LabeledSelect<string>
            label="审计操作"
            size="small"
            value={auditActionFilter}
            onChange={(value) => value !== undefined && onActionFilterChange(value)}
            options={auditActionOptions}
            wrapperClassName={auditStyles.auditActionSelect}
          />
          <Button size="small" onClick={onResetFilters}>
            重置筛选
          </Button>
        </div>
        <div className={auditStyles.auditQuickActions}>
          <Button
            size="small"
            type={isAuditFailedOnly ? 'primary' : 'default'}
            onClick={onApplyFailedOnly}
          >
            仅失败
          </Button>
          <Button size="small" type={isAudit24hFailed ? 'primary' : 'default'} onClick={onApply24hFailed}>
            24h失败
          </Button>
          <Button size="small" type={isAudit7dFailed ? 'primary' : 'default'} onClick={onApply7dFailed}>
            7天失败
          </Button>
        </div>
        <div className={auditStyles.auditToolbarMeta}>
          <span className={styles.notifyDataBadge}>
            结果：{getAuditResultFilterLabel(auditResultFilter)} · 时间：
            {getAuditTimeRangeFilterLabel(auditTimeRangeFilter)} · 操作：
            {auditActionFilter === 'all' ? '全部操作' : auditActionFilter}
          </span>
          <span className={styles.notifyDataBadge}>
            匹配 {filteredAudits.length} / 总计 {auditEvents.length}
          </span>
        </div>
      </div>
      {filteredAudits.length ? (
        <Table<DataOpsAuditEvent>
          rowKey="id"
          columns={columns}
          dataSource={filteredAudits}
          pagination={{
            defaultPageSize: isCompactViewport ? 10 : 20,
            pageSizeOptions: ['10', '20', '50', '100'],
            showSizeChanger: true,
            showQuickJumper: true,
            hideOnSinglePage: true,
            showTotal: renderPaginationTotal,
          }}
          scroll={isCompactViewport ? undefined : { x: 'max-content' }}
        />
      ) : (
        <Empty description="当前筛选条件下没有匹配到运行审计记录" />
      )}
    </>
  );
}
