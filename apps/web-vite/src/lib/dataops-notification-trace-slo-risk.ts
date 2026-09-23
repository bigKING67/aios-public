import type {
  DataOpsNotificationTraceSloRiskLevel,
  DataOpsNotificationTraceSloScanItem,
} from '@/types/dataops';

export type DataOpsNotificationTraceSloScanRiskInput = Pick<
  DataOpsNotificationTraceSloScanItem,
  'breached' | 'triggeredCount' | 'cooldownCount' | 'eventCount' | 'warning'
>;

export function getDataOpsNotificationTraceSloRiskScore(
  item: DataOpsNotificationTraceSloScanRiskInput
): number {
  if (!item.breached) {
    return item.warning ? 15 : 0;
  }

  let score = 60;
  if (item.triggeredCount > 0) {
    score += 120 + Math.min(item.triggeredCount * 12, 120);
  } else if (item.cooldownCount > 0) {
    score += 80 + Math.min(item.cooldownCount * 8, 80);
  } else {
    score += 50;
  }

  score += Math.min(item.eventCount, 60);
  if (item.warning) {
    score += 20;
  }
  return score;
}

export function resolveDataOpsNotificationTraceSloRiskLevel(
  item: DataOpsNotificationTraceSloScanRiskInput,
  riskScore: number
): DataOpsNotificationTraceSloRiskLevel {
  if (!item.breached) {
    return item.warning ? 'watch' : 'normal';
  }
  if (item.triggeredCount > 0 || riskScore >= 220) {
    return 'critical';
  }
  if (item.cooldownCount > 0 || riskScore >= 160) {
    return 'warning';
  }
  return 'watch';
}
