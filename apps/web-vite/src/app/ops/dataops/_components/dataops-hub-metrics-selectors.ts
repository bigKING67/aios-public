import type {
  DataOpsNotificationChannel,
} from '@/config/dataops-hub';
import type {
  DataOpsRuntimePipeline,
  DataOpsRuntimeSyncStream,
} from '@/types/dataops';
import type {
  DataOpsHubMetrics,
} from './dataops-hub-selector-types';

export function buildFallbackDataOpsMetrics({
  pipelines,
  syncStreams,
  notificationChannels,
}: {
  pipelines: DataOpsRuntimePipeline[];
  syncStreams: DataOpsRuntimeSyncStream[];
  notificationChannels: DataOpsNotificationChannel[];
}): DataOpsHubMetrics {
  const totalPipelines = pipelines.length;
  const healthyPipelines = pipelines.filter((item) => item.status === 'healthy').length;
  const warningPipelines = pipelines.filter((item) => item.status === 'warning').length;
  const errorPipelines = pipelines.filter((item) => item.status === 'error').length;
  const pausedPipelines = pipelines.filter((item) => item.status === 'paused').length;
  const avgLagMinutes = Math.round(
    syncStreams.reduce((sum, item) => sum + item.computedLagMinutes, 0) /
      Math.max(syncStreams.length, 1)
  );
  const notificationFailureCount24h = notificationChannels.reduce(
    (sum, item) => sum + item.failureCount24h,
    0
  );
  const healthyRate = Math.round((healthyPipelines / Math.max(totalPipelines, 1)) * 100);

  return {
    totalPipelines,
    healthyPipelines,
    warningPipelines,
    errorPipelines,
    pausedPipelines,
    avgLagMinutes,
    notificationFailureCount24h,
    healthyRate,
  };
}
