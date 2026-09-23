import type { ReactNode } from 'react';
import type {
  ContentAssetProcessingJobStatus,
  ContentAssetProcessingJobType,
  ContentAssetTodoFilter,
} from '../_lib/content-assets-types';

export interface ModuleMetric {
  label: string;
  value: string;
  helper: string;
}

export interface ModulePanelConfig {
  title: string;
  eyebrow: string;
  description: string;
  icon: ReactNode;
  metrics: ModuleMetric[];
  actions: Array<{ label: string; helper: string }>;
}

export type ProcessingJobStatusFilter = 'all' | ContentAssetProcessingJobStatus;
export type ProcessingJobTypeFilter = 'all' | ContentAssetProcessingJobType;
export type AiProcessingJobTypeFilter = Extract<ContentAssetProcessingJobType, 'analysis' | 'transcript'>;

export interface AssetListPreset {
  assetStatus?: string;
  externalOnly?: 'all' | 'true' | 'false';
  lifecycleStatus?: string;
  todo?: ContentAssetTodoFilter;
}
