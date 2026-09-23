import type { PlatformTabColumns } from './platform-tab-columns';

export type TmallPlatformColumns = Pick<
  PlatformTabColumns,
  | 'goodsColumns'
  | 'channelColumns'
  | 'funnelDetailColumnsWithClickStage'
  | 'funnelDetailColumnsWithoutClickStage'
  | 'quantColumns'
>;

export type DouyinPlatformColumns = Pick<
  PlatformTabColumns,
  | 'douyinLiveColumns'
  | 'douyinLiveDetailColumns'
  | 'douyinShortvideoColumns'
  | 'douyinCardProductColumns'
  | 'douyinCardSourceColumns'
  | 'quantColumns'
>;

export function pickTmallPlatformColumns(
  columns: PlatformTabColumns
): TmallPlatformColumns {
  const {
    goodsColumns,
    channelColumns,
    funnelDetailColumnsWithClickStage,
    funnelDetailColumnsWithoutClickStage,
    quantColumns,
  } = columns;

  return {
    goodsColumns,
    channelColumns,
    funnelDetailColumnsWithClickStage,
    funnelDetailColumnsWithoutClickStage,
    quantColumns,
  };
}

export function pickDouyinPlatformColumns(
  columns: PlatformTabColumns
): DouyinPlatformColumns {
  const {
    douyinLiveColumns,
    douyinLiveDetailColumns,
    douyinShortvideoColumns,
    douyinCardProductColumns,
    douyinCardSourceColumns,
    quantColumns,
  } = columns;

  return {
    douyinLiveColumns,
    douyinLiveDetailColumns,
    douyinShortvideoColumns,
    douyinCardProductColumns,
    douyinCardSourceColumns,
    quantColumns,
  };
}
