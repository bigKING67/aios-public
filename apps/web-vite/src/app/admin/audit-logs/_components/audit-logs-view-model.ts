import type { AuditLog } from './audit-logs-types';

export function formatAuditLogCreatedAt(value?: string): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

export function getAuditLogOperator(record: AuditLog): string {
  return record.username || record.operator || '-';
}

export function getAuditLogResourceText(record: AuditLog): string {
  const resourceType = record.resource_type || 'unknown';
  const resourceId = record.resource_id ?? '-';
  return `${resourceType}:${String(resourceId)}`;
}

export function getAuditLogResultState(record: AuditLog) {
  const statusText = record.status || (record.success === false ? 'failed' : 'success');
  const isSuccess = statusText.toLowerCase().includes('success') || record.success === true;

  return {
    color: isSuccess ? 'green' : 'red',
    label: isSuccess ? '成功' : '失败',
  };
}
