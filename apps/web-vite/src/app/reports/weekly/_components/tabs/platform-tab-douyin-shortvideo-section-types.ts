import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type { ReasonAction } from './platform-tab-douyin-diagnostics';
import type { DouyinShortvideoRow } from './platform-tab-types';

export interface DouyinShortvideoSectionData {
  douyinShortvideoAsOfDate: string | undefined;
  douyinShortvideoTableRows: DouyinShortvideoRow[];
  douyinShortvideoTotalCurrent: number;
  douyinShortvideoTotalPrev: number;
  douyinShortvideoTotalDelta: number;
  douyinShortvideoWaterfallSteps: WaterfallStepItem[];
  selectedDouyinShortvideoRow: DouyinShortvideoRow | undefined;
  selectedDouyinShortvideoDiagnosis: ReasonAction[];
}
