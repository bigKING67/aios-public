import type { ColumnsType } from 'antd/es/table';
import type {
  DouyinChannelAttributionLeafPropsBundle,
} from './platform-tab-douyin-channel-leaf-contracts';
import type {
  DouyinAttributionSectionListPropsBundle,
} from './platform-tab-douyin-section-list-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type {
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  DouyinShortvideoRow,
  QuantAttributionRow,
} from './platform-tab-types';

export interface BuildDouyinAttributionSectionPropsParams {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinLiveColumns: ColumnsType<DouyinLiveSessionRow>;
  douyinLiveDetailColumns: ColumnsType<DouyinMetricDetailRow>;
  douyinShortvideoColumns: ColumnsType<DouyinShortvideoRow>;
  douyinCardProductColumns: ColumnsType<DouyinCardProductRow>;
  douyinCardSourceColumns: ColumnsType<DouyinCardSourceRow>;
  quantColumns: ColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
  waterfallTotalColor: string;
}

export interface DouyinAttributionSectionPropsBundle {
  channelSectionProps: DouyinChannelAttributionLeafPropsBundle;
  sectionListProps: DouyinAttributionSectionListPropsBundle;
  showEmptyAttributionSection: boolean;
}
