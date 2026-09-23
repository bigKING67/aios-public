import type { ColumnsType } from 'antd/es/table';
import type {
  DouyinCardProductAttributionLeafPropsBundle,
  DouyinCardSourceAttributionLeafPropsBundle,
  DouyinCardSourceFunnelLeafPropsBundle,
} from './platform-tab-douyin-card-leaf-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import type {
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinMetricDetailRow,
  QuantAttributionRow,
} from './platform-tab-types';

export type DouyinCardAttributionSubsectionKind = 'product' | 'source' | 'funnel';

export interface DouyinCardAttributionSubsectionDescriptor {
  kind: DouyinCardAttributionSubsectionKind;
}

export interface BuildDouyinCardAttributionSectionPropsParams {
  isMobile: boolean;
  data: DouyinSectionData;
  douyinCardProductColumns: ColumnsType<DouyinCardProductRow>;
  douyinCardSourceColumns: ColumnsType<DouyinCardSourceRow>;
  douyinLiveDetailColumns: ColumnsType<DouyinMetricDetailRow>;
  quantColumns: ColumnsType<QuantAttributionRow>;
  resolveFunnelStageColor: (index: number) => string;
  waterfallTotalColor: string;
}

export interface DouyinCardAttributionSectionPropsBundle {
  subsectionList: DouyinCardAttributionSubsectionDescriptor[];
  productSectionProps: DouyinCardProductAttributionLeafPropsBundle;
  sourceSectionProps: DouyinCardSourceAttributionLeafPropsBundle;
  funnelSectionProps: DouyinCardSourceFunnelLeafPropsBundle;
}

export interface DouyinCardAttributionSectionsProps
  extends DouyinCardAttributionSectionPropsBundle {}
