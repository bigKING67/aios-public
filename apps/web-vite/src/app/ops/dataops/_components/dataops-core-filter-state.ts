import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { DataOpsStatus } from '@/config/dataops-hub';
import type {
  DataOpsRuntimeFeishuSyncJob,
  DataOpsRuntimePipeline,
  DataOpsRuntimeSyncStream,
} from '@/types/dataops';
import {
  filterDataOpsFeishuSyncJobs,
  filterDataOpsPipelines,
  filterDataOpsSyncStreams,
  sortDataOpsFeishuSyncJobs,
  sortDataOpsSyncStreams,
  summarizeDataOpsStatuses,
} from './dataops-hub-selectors';
import type { DataOpsMessageApi } from './dataops-feedback-types';

export function useDataOpsCoreFilterState(options: {
  feishuSyncJobs: DataOpsRuntimeFeishuSyncJob[];
  message: DataOpsMessageApi;
  normalizedKeyword: string;
  pipelineMap: Map<string, DataOpsRuntimePipeline>;
  pipelines: DataOpsRuntimePipeline[];
  selectedPipelineIds: string[];
  setSelectedPipelineIds: Dispatch<SetStateAction<string[]>>;
  statusFilter: DataOpsStatus | 'all';
  syncStreams: DataOpsRuntimeSyncStream[];
}) {
  const {
    feishuSyncJobs,
    message,
    normalizedKeyword,
    pipelineMap,
    pipelines,
    selectedPipelineIds,
    setSelectedPipelineIds,
    statusFilter,
    syncStreams,
  } = options;

  const selectedPipelines = useMemo(
    () =>
      selectedPipelineIds
        .map((id) => pipelineMap.get(id))
        .filter((item): item is DataOpsRuntimePipeline => Boolean(item)),
    [pipelineMap, selectedPipelineIds]
  );

  const filteredPipelines = useMemo(
    () => filterDataOpsPipelines({ pipelines, statusFilter, normalizedKeyword }),
    [normalizedKeyword, pipelines, statusFilter]
  );

  const selectableFilteredPipelines = useMemo(
    () => filteredPipelines.filter((item) => Boolean(item.runtime?.deploymentId)),
    [filteredPipelines]
  );

  const filteredStreams = useMemo(
    () => filterDataOpsSyncStreams({ syncStreams, statusFilter, normalizedKeyword }),
    [normalizedKeyword, statusFilter, syncStreams]
  );
  const prioritizedStreams = useMemo(
    () => sortDataOpsSyncStreams(filteredStreams),
    [filteredStreams]
  );
  const syncStatusSummary = useMemo(
    () => summarizeDataOpsStatuses(filteredStreams),
    [filteredStreams]
  );

  const filteredFeishuSyncJobs = useMemo(
    () => filterDataOpsFeishuSyncJobs({ feishuSyncJobs, statusFilter, normalizedKeyword }),
    [feishuSyncJobs, normalizedKeyword, statusFilter]
  );
  const prioritizedFeishuSyncJobs = useMemo(
    () => sortDataOpsFeishuSyncJobs(filteredFeishuSyncJobs),
    [filteredFeishuSyncJobs]
  );
  const feishuSyncStatusSummary = useMemo(
    () => summarizeDataOpsStatuses(filteredFeishuSyncJobs),
    [filteredFeishuSyncJobs]
  );

  const applyQuickPipelineSelection = useCallback(
    (
      predicate: (pipeline: DataOpsRuntimePipeline) => boolean,
      emptyTip: string
    ) => {
      const matchedIds = selectableFilteredPipelines
        .filter(predicate)
        .map((item) => item.id);

      if (!matchedIds.length) {
        message.info(emptyTip);
        return;
      }

      setSelectedPipelineIds(matchedIds);
      message.success(`已选中 ${matchedIds.length} 个任务`);
    },
    [message, selectableFilteredPipelines, setSelectedPipelineIds]
  );

  return {
    applyQuickPipelineSelection,
    feishuSyncStatusSummary,
    filteredPipelines,
    prioritizedFeishuSyncJobs,
    prioritizedStreams,
    selectedPipelines,
    syncStatusSummary,
  };
}
