import { Empty } from 'antd';
import { Badge } from '@/components/atoms/badge';
import { formatInteger } from '../_lib/live-center-formatters';
import type {
  LiveCenterAnalysisMomentReviewItem,
  LiveCenterAnalysisScorecardItem,
  LiveCenterAnalysisScriptReviewItem,
} from '../_lib/live-center-view-helpers';
import sectionStyles from '../live-center-analysis-review-sections.module.css';
import resultStyles from '../live-center-analysis-result.module.css';
import {
  formatVerdictLabel,
  formatReaderTimeAnchor,
  formatTimeAnchor,
  resolveScorecardBadge,
} from './live-center-analysis-result-formatters';
import {
  ResultSection,
  TimeAnchorPlaybackButton,
  type TimeAnchorPlayableResolver,
  type TimeAnchorPlaybackHandler,
} from './live-center-analysis-result-utils';

export function MomentReviewsSection({
  expanded,
  isTimeAnchorPlayable,
  items,
  onToggleExpanded,
  onPlayTimeAnchor,
  playbackLoadingKey,
  totalCount,
  visibleLimit,
}: {
  expanded: boolean;
  isTimeAnchorPlayable?: TimeAnchorPlayableResolver;
  items: LiveCenterAnalysisMomentReviewItem[];
  onToggleExpanded: () => void;
  onPlayTimeAnchor?: TimeAnchorPlaybackHandler;
  playbackLoadingKey?: string | null;
  totalCount: number;
  visibleLimit: number;
}) {
  const hasSignalGap = items.some((item) => (
    !isSpecificMomentSignal(item.metricSignal) &&
    !isSpecificMomentSignal(item.visualSignal)
  ));

  return (
    <ResultSection
      title="时间复盘"
      visibleCount={items.length}
      totalCount={totalCount}
      visibleLimit={visibleLimit}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      {items.length > 0 ? (
        <>
          {hasSignalGap ? (
            <p className={sectionStyles.reviewSectionNotice}>
              指标/画面细节未逐条结构化；本区只保留时间锚点和运营判断，原始证据见追溯材料。
            </p>
          ) : null}
          <ol className={sectionStyles.momentReviewList}>
            {items.map((item, index) => {
              const hasDistinctOperatorRead = !isSameReviewText(item.whatHappened, item.operatorRead);
              const hasMetricSignal = isSpecificMomentSignal(item.metricSignal);
              const hasVisualSignal = isSpecificMomentSignal(item.visualSignal);
              const hasSpecificAction = isSpecificRecommendedAction(item.recommendedAction);
              const readerTimeAnchor = formatReaderTimeAnchor(item.timeAnchor);

              return (
                <li key={`${readerTimeAnchor || formatTimeAnchor(item.timeAnchor)}-${item.title}-${index}`}>
                  <article className={sectionStyles.momentReviewCard}>
                    <div className={sectionStyles.momentTimeRail}>
                      <strong>{readerTimeAnchor || `时间待定位 ${formatInteger(index + 1)}`}</strong>
                    </div>
                    <div className={sectionStyles.momentReviewBody}>
                      <div className={resultStyles.analysisResultRowTitle}>
                        <strong>{item.title}</strong>
                      </div>
                      <div className={hasDistinctOperatorRead ? sectionStyles.momentNarrative : sectionStyles.momentNarrativeSingle}>
                        <ReviewFact
                          label={hasDistinctOperatorRead ? '发生了什么' : '复盘判断'}
                          value={item.whatHappened}
                          emphasis={!hasDistinctOperatorRead}
                        />
                        {hasDistinctOperatorRead ? <ReviewFact label="运营判断" value={item.operatorRead} emphasis /> : null}
                      </div>
                      {hasMetricSignal || hasVisualSignal ? (
                        <div className={sectionStyles.momentSignalList}>
                          {hasMetricSignal ? <ReviewFact label="指标信号" value={item.metricSignal} compact /> : null}
                          {hasVisualSignal ? <ReviewFact label="画面承接" value={item.visualSignal} compact /> : null}
                        </div>
                      ) : null}
                      {item.scriptQuote ? (
                        <blockquote className={sectionStyles.scriptQuote}>“{item.scriptQuote}”</blockquote>
                      ) : null}
                      {hasSpecificAction ? <RecommendedAction value={item.recommendedAction} /> : null}
                      <div className={resultStyles.analysisResultTaskMeta}>
                        <TimeAnchorPlaybackButton
                          anchor={item.timeAnchor}
                          isTimeAnchorPlayable={isTimeAnchorPlayable}
                          onPlayTimeAnchor={onPlayTimeAnchor}
                          playbackLoadingKey={playbackLoadingKey}
                          sourceLabel={item.title}
                          unplayableLabel="录屏不可播放"
                        />
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <Empty
          className={resultStyles.analysisResultEmpty}
          description="未返回 momentReviews，也没有可兼容的 timeline；请重跑分析或人工标注关键时间点。"
        />
      )}
    </ResultSection>
  );
}

export function ScriptReviewsSection({
  expanded,
  isTimeAnchorPlayable,
  items,
  onToggleExpanded,
  onPlayTimeAnchor,
  playbackLoadingKey,
  totalCount,
  visibleLimit,
}: {
  expanded: boolean;
  isTimeAnchorPlayable?: TimeAnchorPlayableResolver;
  items: LiveCenterAnalysisScriptReviewItem[];
  onToggleExpanded: () => void;
  onPlayTimeAnchor?: TimeAnchorPlaybackHandler;
  playbackLoadingKey?: string | null;
  totalCount: number;
  visibleLimit: number;
}) {
  const hasFallbackOnly = items.length > 0 && items.every(isFallbackScriptReviewItem);

  return (
    <ResultSection
      title="话术复盘"
      visibleCount={items.length}
      totalCount={totalCount}
      visibleLimit={visibleLimit}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      {items.length > 0 ? (
        <div className={sectionStyles.scriptReviewList}>
          {hasFallbackOnly ? (
            <p className={sectionStyles.reviewSectionNotice}>
              当前只有代表性原话短摘，尚未形成完整逐条运营点评；完整底稿和证据索引已放到追溯材料。
            </p>
          ) : null}
          {items.map((item, index) => {
            const isFallbackItem = isFallbackScriptReviewItem(item);
            const hasStructuredComment = !isFallbackItem && isSpecificScriptReviewText(item.operatorComment);
            const hasStructuredRewrite = !isFallbackItem && isSpecificScriptReviewText(item.rewriteSuggestion);
            const readerTimeAnchor = formatReaderTimeAnchor(item.timeAnchor);

            return (
              <article className={sectionStyles.scriptReviewCard} key={`${readerTimeAnchor || formatTimeAnchor(item.timeAnchor)}-${item.intent}-${index}`}>
                <div className={sectionStyles.scriptReviewHeader}>
                  <span>{readerTimeAnchor || `话术 ${formatInteger(index + 1)}`}</span>
                  <strong>{item.intent}</strong>
                </div>
                <blockquote className={`${sectionStyles.scriptQuote} ${sectionStyles.scriptQuoteClamped}`}>“{item.quote}”</blockquote>
                {hasStructuredComment || hasStructuredRewrite ? (
                  <div className={sectionStyles.momentNarrative}>
                    {hasStructuredComment ? <ReviewFact label="运营点评" value={item.operatorComment} /> : null}
                    {hasStructuredRewrite ? <ReviewFact label="改写方向" value={item.rewriteSuggestion} emphasis /> : null}
                  </div>
                ) : isFallbackItem ? null : (
                  <span className={resultStyles.analysisResultSubMeta}>这条只有原话短摘，尚未形成运营点评；改写请进入动作清单或人工复核。</span>
                )}
                <div className={resultStyles.analysisResultTaskMeta}>
                  {item.riskFlags.map((flag) => <span key={flag}>风险 {flag}</span>)}
                  <TimeAnchorPlaybackButton
                    anchor={item.timeAnchor}
                    disabledLabel="原话待定位"
                    isTimeAnchorPlayable={isTimeAnchorPlayable}
                    label="查看原话位置"
                    onPlayTimeAnchor={onPlayTimeAnchor}
                    playbackLoadingKey={playbackLoadingKey}
                    sourceLabel={item.intent || item.quote}
                    unplayableLabel="原话不可播放"
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          className={resultStyles.analysisResultEmpty}
          description="本次未生成逐条话术点评；若追溯材料也没有可核验原话，请先补齐讲解底稿或安排人工复核。"
        />
      )}
    </ResultSection>
  );
}

export function ScorecardSection({
  expanded,
  items,
  onToggleExpanded,
  totalCount,
  visibleLimit,
}: {
  expanded: boolean;
  items: LiveCenterAnalysisScorecardItem[];
  onToggleExpanded: () => void;
  totalCount: number;
  visibleLimit: number;
}) {
  const sharedDiagnosis = resolveSharedScorecardText(items.map((item) => item.diagnosis));
  const sharedFix = resolveSharedScorecardText(items.map((item) => item.fix));

  return (
    <ResultSection
      title="六维运营评分"
      visibleCount={items.length}
      totalCount={totalCount}
      visibleLimit={visibleLimit}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      {items.length > 0 ? (
        <div className={sectionStyles.scorecardStack}>
          {sharedDiagnosis || sharedFix ? (
            <div className={sectionStyles.scorecardSharedNote}>
              <span>共性判断</span>
              {sharedDiagnosis ? <p>{sharedDiagnosis}</p> : null}
              {sharedFix ? <p>{sharedFix}</p> : null}
            </div>
          ) : null}
          <div className={sectionStyles.scorecardList}>
            {items.map((item, index) => (
              <article className={sectionStyles.scorecardRow} key={`${item.dimension}-${index}`}>
                <div className={sectionStyles.scorecardHeader}>
                  <strong>{item.dimension}</strong>
                  <span>{item.score || '待评'}</span>
                </div>
                <div className={sectionStyles.scorecardBody}>
                  {item.status ? <Badge status={resolveScorecardBadge(item.status)}>{formatVerdictLabel(item.status)}</Badge> : null}
                  {!sharedDiagnosis ? <p>{item.diagnosis}</p> : null}
                  {!sharedFix ? <RecommendedAction label="改法" value={item.fix} compact /> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <Empty className={resultStyles.analysisResultEmpty} description="本次未返回结构化六维评分；请以核心结论、时间复盘和行动优先级为主。" />
      )}
    </ResultSection>
  );
}

function ReviewFact({
  compact = false,
  emphasis = false,
  label,
  value,
}: {
  compact?: boolean;
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={[
        sectionStyles.reviewFact,
        compact ? sectionStyles.reviewFactCompact : '',
        emphasis ? sectionStyles.reviewFactEmphasis : '',
      ].filter(Boolean).join(' ')}
    >
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function isSameReviewText(left: string, right: string): boolean {
  return normalizeReviewComparableText(left) === normalizeReviewComparableText(right);
}

function normalizeReviewComparableText(value: string): string {
  return value.replace(/\s+/g, '').replace(/[。；;,.，]/g, '').trim();
}

function isSpecificMomentSignal(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) &&
    !normalized.startsWith('历史 timeline 未') &&
    !normalized.startsWith('未返回') &&
    !normalized.includes('证据不足');
}

function isSpecificRecommendedAction(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) &&
    !normalized.startsWith('复核该片段') &&
    !normalized.startsWith('复核该时间点') &&
    !normalized.startsWith('未返回');
}

function isSpecificScriptReviewText(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) &&
    !normalized.startsWith('模型未返回 scriptReview') &&
    !normalized.startsWith('当前只有代表性原话短摘') &&
    !normalized.startsWith('当前仅把 ASR 原文') &&
    !normalized.startsWith('这条只有原话短摘') &&
    !normalized.startsWith('复核后补齐') &&
    !normalized.startsWith('未返回');
}

function isFallbackScriptReviewItem(item: LiveCenterAnalysisScriptReviewItem): boolean {
  return item.intent === 'ASR 代表原话' ||
    item.intent === '原话短摘' ||
    item.operatorComment.startsWith('已拿到原话底稿');
}

function resolveSharedScorecardText(values: string[]): string | null {
  const normalizedValues = values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !value.startsWith('未返回'));
  if (normalizedValues.length < 3) {
    return null;
  }
  const [firstValue] = normalizedValues;
  return normalizedValues.every((value) => normalizeReviewComparableText(value) === normalizeReviewComparableText(firstValue))
    ? firstValue
    : null;
}

function RecommendedAction({
  compact = false,
  label = '建议动作',
  value,
}: {
  compact?: boolean;
  label?: string;
  value: string;
}) {
  return (
    <div className={`${sectionStyles.recommendedAction}${compact ? ` ${sectionStyles.recommendedActionCompact}` : ''}`}>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}
