import type { ColumnsType } from 'antd/es/table';
import {
  buildDouyinCardProductColumns,
  buildDouyinCardSourceColumns,
  buildDouyinLiveColumns,
  buildDouyinMetricDetailColumns,
  buildDouyinShortvideoColumns,
} from './platform-tab-douyin-columns';
import {
  buildChannelColumns,
  buildFunnelDetailColumns,
  buildGoodsColumns,
  buildQuantColumns,
} from './platform-tab-table-columns';
import type {
  ChannelAttributionRow,
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
  DouyinShortvideoRow,
  FunnelChannelRow,
  GoodsTableRow,
  QuantAttributionRow,
} from './platform-tab-types';

type TrendClassNameResolver = (value: number | undefined) => string;

interface TmallPlatformColumns {
  goodsColumns: ColumnsType<GoodsTableRow>;
  channelColumns: ColumnsType<ChannelAttributionRow>;
  funnelDetailColumnsWithClickStage: ColumnsType<FunnelChannelRow>;
  funnelDetailColumnsWithoutClickStage: ColumnsType<FunnelChannelRow>;
  quantColumns: ColumnsType<QuantAttributionRow>;
}

interface DouyinPlatformColumns {
  douyinLiveColumns: ColumnsType<DouyinLiveSessionRow>;
  douyinLiveDetailColumns: ColumnsType<DouyinMetricDetailRow>;
  douyinShortvideoColumns: ColumnsType<DouyinShortvideoRow>;
  douyinCardProductColumns: ColumnsType<DouyinCardProductRow>;
  douyinCardSourceColumns: ColumnsType<DouyinCardSourceRow>;
}

export interface PlatformTabColumns extends TmallPlatformColumns, DouyinPlatformColumns {}

export function buildPlatformTabColumns(
  resolveTrendClassName: TrendClassNameResolver
): PlatformTabColumns {
  const {
    withClickStage: funnelDetailColumnsWithClickStage,
    withoutClickStage: funnelDetailColumnsWithoutClickStage,
  } = buildFunnelDetailColumns(resolveTrendClassName);

  return {
    goodsColumns: buildGoodsColumns(resolveTrendClassName),
    channelColumns: buildChannelColumns(resolveTrendClassName),
    funnelDetailColumnsWithClickStage,
    funnelDetailColumnsWithoutClickStage,
    quantColumns: buildQuantColumns(),
    douyinLiveColumns: buildDouyinLiveColumns(resolveTrendClassName),
    douyinLiveDetailColumns: buildDouyinMetricDetailColumns(),
    douyinShortvideoColumns: buildDouyinShortvideoColumns(resolveTrendClassName),
    douyinCardProductColumns: buildDouyinCardProductColumns(resolveTrendClassName),
    douyinCardSourceColumns: buildDouyinCardSourceColumns(resolveTrendClassName),
  };
}
