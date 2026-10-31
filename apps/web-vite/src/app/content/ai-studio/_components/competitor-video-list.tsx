import { ExternalLink, Video } from 'lucide-react';
import { Button, confirmModal, Pagination, SkeletonText, Table, type TableColumnsType } from '@lobehub/ui';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  analysisStatusView,
  competitorVideoTitle,
  ESTIMATED_CNY_PER_VIDEO,
  hasAnalysisCard,
  isAnalysisActive,
  isAnalysisComplete,
  type StudioCompetitorVideo,
} from '../_lib/competitor-api';
import { formatClock } from '../_lib/competitor-card';
import { formatShortTimestamp } from '../_lib/studio-time';
import styles from './segment-annotation.module.css';
import competitorStyles from './competitor.module.css';

/** Phones get one card per video: the table's status and actions sat off-screen at this width. */
const COMPACT_QUERY = '(max-width: 680px)';
const PAGE_SIZE = 20;

function formatCost(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `¥${value.toFixed(3)}`;
}

interface CompetitorVideoListProps {
  videos: readonly StudioCompetitorVideo[];
  loading: boolean;
  canWrite: boolean;
  openAnalysisId: string | null;
  /** awemeId whose analysis is being started, if any. */
  analyzing: string | null;
  onOpen: (analysisId: string, awemeId?: string) => void;
  onEdit: (video: StudioCompetitorVideo) => void;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  onAnalyze: (awemeId: string) => void;
}

/** The opening frame of the latest analysis (a light placeholder before one exists), then title and links. */
function VideoTitle({ video }: { video: StudioCompetitorVideo }) {
  const title = competitorVideoTitle(video);
  return (
    <div className={competitorStyles.videoIdentity}>
      <span className={competitorStyles.videoThumb} aria-hidden>
        {video.coverUrl ? <img src={video.coverUrl} alt="" loading="lazy" /> : <Video size={14} strokeWidth={1.6} />}
      </span>
      <div className={competitorStyles.videoCell}>
        <span className={competitorStyles.videoTitle} title={title}>
          {title}
        </span>
        <span className={competitorStyles.videoMeta}>
          {video.authorName ? <span>{video.authorName}</span> : null}
          <a className={styles.tableLink} href={video.shareUrl} target="_blank" rel="noreferrer noopener">
            抖音原片 <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">（新窗口打开）</span>
          </a>
        </span>
        <span className={competitorStyles.videoMeta}>
          {(video.sources ?? [video.source]).map((source) => source === 'compass' ? '罗盘' : '手动').join(' · ')}
          {video.latestRankingDate ? ` · 最近上榜 ${video.latestRankingDate} · ${video.rankingDays} 天${video.bestRank ? ` · 直播间最佳第 ${video.bestRank} 名` : ''}`
            : video.source === 'compass' && !video.manualAddedAt ? ' · 历史收录' : ''}
          {video.manualAddedAt ? ` · 手动收录 ${formatShortTimestamp(video.manualAddedAt)}` : ''}
        </span>
      </div>
    </div>
  );
}

/** Status with time and cost: one line in a phone card, stacked in the narrow table column. */
function AnalysisState({ video, stacked = false }: { video: StudioCompetitorVideo; stacked?: boolean }) {
  const analysis = video.latestAnalysis;
  if (!analysis) return <span className={styles.readOnlyHint}>未分析</span>;
  const view = analysisStatusView(analysis.status === 'succeeded' && !isAnalysisComplete(analysis) ? 'partial' : analysis.status);
  const when = formatShortTimestamp(analysis.finishedAt ?? analysis.createdAt);
  const cost = formatCost(analysis.costYuan);
  if (stacked) {
    return (
      <div className={competitorStyles.stackCell}>
        <AiTaskStatus compact state={view.state} stateLabel={view.label} />
        <small className={`${styles.readOnlyHint} ${competitorStyles.tabular}`}>{when}</small>
        {cost ? <small className={`${styles.readOnlyHint} ${competitorStyles.tabular}`}>{cost}</small> : null}
      </div>
    );
  }
  return (
    <AiTaskStatus
      compact
      state={view.state}
      stateLabel={view.label}
      detail={<span className={competitorStyles.tabular}>{cost ? `${when} · ${cost}` : when}</span>}
    />
  );
}

function VideoActions({ video, canWrite, analyzing, onOpen, onAnalyze, onEdit }: { video: StudioCompetitorVideo } & Pick<
  CompetitorVideoListProps,
  'canWrite' | 'analyzing' | 'onOpen' | 'onAnalyze' | 'onEdit'
>) {
  const analysis = video.latestAnalysis;
  const active = isAnalysisActive(analysis);
  const canAnalyze = canWrite && !active && !isAnalysisComplete(analysis);
  return (
    <div className={styles.rowActions}>
      {canWrite ? <Button type="text" size="small" onClick={() => onEdit(video)}>编辑资料</Button> : null}
      {analysis ? (
        <Button size="small" type="text" className={styles.touchButton} onClick={() => onOpen(analysis.analysisId, video.awemeId)}>
          {hasAnalysisCard(analysis) ? '查看拆解' : active ? '查看进度' : '查看原因'}
        </Button>
      ) : null}
      {canAnalyze ? (
        <AiActionButton
          quiet
          size="small"
          className={styles.touchButton}
          loading={analyzing === video.awemeId}
          disabled={analyzing !== null}
          onClick={() =>
            confirmModal({
              title: analysis ? '重新分析这条视频？' : '分析这条视频？',
              content: `会下载抖音原片并调用模型，约 ¥${ESTIMATED_CNY_PER_VIDEO.toFixed(2)}/条。`,
              okText: '开始分析',
              cancelText: '取消',
              onOk: () => onAnalyze(video.awemeId),
            })
          }
        >
          {analysis ? '重新分析' : '分析'}
        </AiActionButton>
      ) : null}
    </div>
  );
}

function BrandLine({ video }: { video: StudioCompetitorVideo }) {
  return (
    <>
      <span>{video.brandName || '--'}</span>
      <small className={styles.readOnlyHint}>{video.productCategory || '品类待识别'}</small>
    </>
  );
}

/** 竞品视频: a table on wide screens, a card list on phones. */
export function CompetitorVideoList(props: CompetitorVideoListProps) {
  const { videos, loading, openAnalysisId } = props;
  const compact = useMediaQuery(COMPACT_QUERY);

  const emptyText = '所选来源和日期内没有视频，可调整筛选或添加视频。';
  const pager = props.total > PAGE_SIZE ? <div className={competitorStyles.catalogPager}><Pagination current={props.page} total={props.total} pageSize={PAGE_SIZE} showSizeChanger={false} onChange={props.onPageChange} showTotal={(total) => `共 ${total} 条视频`} /></div> : null;

  if (compact) {
    if (loading) return <SkeletonText rows={4} />;
    if (videos.length === 0) return <p className={styles.fieldHelp}>{emptyText}</p>;
    return (
      <div className={competitorStyles.videoList}>
        <ul aria-label="竞品视频">
          {videos.map((video) => (
            <li
              key={video.awemeId}
              className={video.latestAnalysis?.analysisId === openAnalysisId ? competitorStyles.videoCardActive : undefined}
            >
              <VideoTitle video={video} />
              <span className={competitorStyles.videoFacts}>
                <BrandLine video={video} />
                <span className={competitorStyles.tabular}>{formatClock(video.durationSeconds)}</span>
              </span>
              <AnalysisState video={video} />
              <VideoActions video={video} {...props} />
            </li>
          ))}
        </ul>
        {pager}
      </div>
    );
  }

  const columns: TableColumnsType<StudioCompetitorVideo> = [
    { title: '视频', key: 'video', render: (_, video) => <VideoTitle video={video} /> },
    {
      title: '品牌 / 品类',
      key: 'brand',
      width: 140,
      render: (_, video) => (
        <div className={competitorStyles.stackCell}>
          <BrandLine video={video} />
        </div>
      ),
    },
    {
      title: '时长',
      key: 'duration',
      width: 72,
      align: 'right',
      render: (_, video) => <span className={competitorStyles.tabular}>{formatClock(video.durationSeconds)}</span>,
    },
    { title: '拆解', key: 'analysis', width: 150, render: (_, video) => <AnalysisState video={video} stacked /> },
    { title: '操作', key: 'actions', width: 168, render: (_, video) => <VideoActions video={video} {...props} /> },
  ];

  return (
    <div className={styles.tableScroll}>
      <Table<StudioCompetitorVideo>
        rowKey="awemeId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={[...videos]}
        pagination={false}
        rowClassName={(video) => (video.latestAnalysis?.analysisId === openAnalysisId ? styles.rowActive : '')}
        locale={{ emptyText }}
        scroll={{ x: 720 }}
      />
      {pager}
    </div>
  );
}
