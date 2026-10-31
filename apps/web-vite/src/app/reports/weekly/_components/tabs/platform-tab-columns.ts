import type { TableColumnsType } from '@lobehub/ui';
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
  goodsColumns: TableColumnsType<GoodsTableRow>;
  channelColumns: TableColumnsType<ChannelAttributionRow>;
  funnelDetailColumnsWithClickStage: TableColumnsType<FunnelChannelRow>;
  funnelDetailColumnsWithoutClickStage: TableColumnsType<FunnelChannelRow>;
  quantColumns: TableColumnsType<QuantAttributionRow>;
}

interface DouyinPlatformColumns {
  douyinLiveColumns: TableColumnsType<DouyinLiveSessionRow>;
  douyinLiveDetailColumns: TableColumnsType<DouyinMetricDetailRow>;
  douyinShortvideoColumns: TableColumnsType<DouyinShortvideoRow>;
  douyinCardProductColumns: TableColumnsType<DouyinCardProductRow>;
  douyinCardSourceColumns: TableColumnsType<DouyinCardSourceRow>;
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
