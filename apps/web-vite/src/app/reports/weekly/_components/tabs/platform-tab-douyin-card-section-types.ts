import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type {
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinMetricDetailRow,
  FunnelStagePoint,
  QuantAttributionRow,
} from './platform-tab-types';

export interface DouyinCardSectionData {
  douyinCardAsOfDate: string | undefined;
  douyinCardProductTableRows: DouyinCardProductRow[];
  douyinCardTotalCurrent: number;
  douyinCardTotalPrev: number;
  douyinCardTotalDelta: number;
  douyinCardProductWaterfallSteps: WaterfallStepItem[];
  diagnosisCardProductId: string;
  diagnosisCardProductName: string;
  douyinCardSourceTableRows: DouyinCardSourceRow[];
  douyinCardSourceTotalCurrent: number;
  douyinCardSourceTotalPrev: number;
  douyinCardSourceTotalDelta: number;
  douyinCardSourceWaterfallSteps: WaterfallStepItem[];
  selectedDouyinCardSource: DouyinCardSourceRow | undefined;
  selectedDouyinCardSourceStages: FunnelStagePoint[];
  selectedDouyinCardQuantRows: QuantAttributionRow[];
  selectedDouyinCardDetailRows: DouyinMetricDetailRow[];
}
