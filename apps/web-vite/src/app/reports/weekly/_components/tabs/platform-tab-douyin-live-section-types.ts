import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type {
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  FunnelStagePoint,
  QuantAttributionRow,
} from './platform-tab-types';

export interface DouyinLiveSectionData {
  douyinLiveAsOfDate: string | undefined;
  douyinLiveTableRows: DouyinLiveSessionRow[];
  douyinLiveTotalCurrent: number;
  douyinLiveTotalPrev: number;
  douyinLiveTotalDelta: number;
  douyinLiveWaterfallSteps: WaterfallStepItem[];
  selectedDouyinLiveRow: DouyinLiveSessionRow | undefined;
  selectedDouyinLiveStages: FunnelStagePoint[];
  selectedDouyinLiveDetailRows: DouyinMetricDetailRow[];
  selectedDouyinLiveQuantRows: QuantAttributionRow[];
}
