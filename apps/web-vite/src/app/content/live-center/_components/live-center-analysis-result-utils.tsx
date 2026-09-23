import type { ReactNode } from 'react';
import { Button } from 'antd';
import { formatInteger } from '../_lib/live-center-formatters';
import type { LiveCenterAnalysisTimeAnchor } from '../_lib/live-center-view-helpers';
import resultStyles from '../live-center-analysis-result.module.css';
import { buildTimeAnchorPlaybackKey } from './live-center-analysis-result-formatters';

export type ResultSectionHeaderVariant = 'default' | 'metaOnly';

export type TimeAnchorPlaybackHandler = (anchor: LiveCenterAnalysisTimeAnchor, sourceLabel: string) => void;
export type TimeAnchorPlayableResolver = (anchor: LiveCenterAnalysisTimeAnchor) => boolean;

export function ResultSection({
  children,
  expanded = false,
  headerVariant = 'default',
  onToggleExpanded,
  title,
  totalCount,
  visibleCount,
  visibleLimit,
}: {
  children: ReactNode;
  expanded?: boolean;
  headerVariant?: ResultSectionHeaderVariant;
  onToggleExpanded?: () => void;
  title: string;
  totalCount?: number;
  visibleCount: number;
  visibleLimit?: number;
}) {
  const resolvedTotalCount = totalCount ?? visibleCount;
  const isExpandable = Boolean(onToggleExpanded && visibleLimit && resolvedTotalCount > visibleLimit);
  const countLabel = isExpandable
    ? `${formatInteger(visibleCount)} / ${formatInteger(resolvedTotalCount)}`
    : formatInteger(resolvedTotalCount);

  return (
    <section className={resultStyles.analysisResultSection}>
      <div
        className={[
          resultStyles.analysisResultSectionHeader,
          headerVariant === 'metaOnly' ? resultStyles.analysisResultSectionHeaderMetaOnly : '',
        ].filter(Boolean).join(' ')}
      >
        {headerVariant === 'default' ? <h3>{title}</h3> : null}
        <div className={resultStyles.analysisResultSectionMeta}>
          <span>{countLabel}</span>
          {isExpandable ? (
            <Button type="link" size="small" onClick={onToggleExpanded}>
              {expanded ? '收起' : '展开全部'}
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TimeAnchorPlaybackButton({
  anchor,
  disabledLabel = '录屏待定位',
  isTimeAnchorPlayable,
  label = '查看录屏位置',
  onPlayTimeAnchor,
  playbackLoadingKey,
  sourceLabel,
  unplayableLabel = '录屏不可播放',
}: {
  anchor: LiveCenterAnalysisTimeAnchor;
  disabledLabel?: string;
  isTimeAnchorPlayable?: TimeAnchorPlayableResolver;
  label?: string;
  onPlayTimeAnchor?: TimeAnchorPlaybackHandler;
  playbackLoadingKey?: string | null;
  sourceLabel: string;
  unplayableLabel?: string;
}) {
  const playable = Boolean(onPlayTimeAnchor && isTimeAnchorPlayable?.(anchor));
  const loading = playbackLoadingKey === buildTimeAnchorPlaybackKey(anchor, sourceLabel);
  const inactiveLabel = hasLocatableTimeAnchor(anchor) ? unplayableLabel : disabledLabel;

  return (
    <Button
      className={resultStyles.analysisResultInlineAction}
      disabled={!playable}
      loading={loading}
      onClick={() => {
        if (playable) {
          onPlayTimeAnchor?.(anchor, sourceLabel);
        }
      }}
      size="small"
      title={playable ? label : '没有可播放的已上传分段或可定位时间锚点'}
      type="link"
    >
      {playable ? label : inactiveLabel}
    </Button>
  );
}

function hasLocatableTimeAnchor(anchor: LiveCenterAnalysisTimeAnchor): boolean {
  if (
    anchor.segmentIndex !== null ||
    anchor.displaySegmentIndex !== null ||
    anchor.offsetStartSeconds !== null ||
    anchor.offsetEndSeconds !== null
  ) {
    return true;
  }
  return [
    anchor.clockTimeRange,
    anchor.offsetRange,
    anchor.minuteRangeLabel,
    anchor.segmentLabel,
    anchor.displayTimeRange,
  ].some((value) => {
    const normalized = value?.trim();
    return Boolean(normalized && !/待定位|未定位|unknown|pending/i.test(normalized));
  });
}
