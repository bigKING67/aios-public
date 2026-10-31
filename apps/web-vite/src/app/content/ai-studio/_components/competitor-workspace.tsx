import { Plus } from 'lucide-react';
import { Alert, Button, Tooltip } from '@lobehub/ui';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  fetchCompetitorVideo,
  competitorVideoTitle,
  isAnalysisActive,
  type StudioCompetitorVideo,
} from '../_lib/competitor-api';
import { CompetitorAnalysisDrawer } from './competitor-analysis-drawer';
import { CompetitorVideoList } from './competitor-video-list';
import { CompetitorAddModal } from './competitor-add-modal';
import { CompetitorVideoEdit } from './competitor-video-edit';
import { CompetitorVideoFilters } from './competitor-video-filters';
import { readVideoFilters, changeVideoFilters } from '../_lib/competitor-video-filters';
import { formatShortTimestamp } from '../_lib/studio-time';
import { useCompetitorVideos } from './use-competitor-videos';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import competitorStyles from './competitor.module.css';
import { RefreshButton } from './refresh-button';

const ANALYSIS_PARAM = 'analysis';

export const COMPETITOR_PAGE_TITLE = '爆款视频';
export const COMPETITOR_PAGE_PURPOSE =
  '按日期查看罗盘榜单与手动收录的视频，AI 拆出框架结构、卖点和逐句口播；同一作品只保留一条。';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

interface CompetitorWorkspaceProps {
  canWrite: boolean;
}

export function CompetitorWorkspace({ canWrite }: CompetitorWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readVideoFilters(searchParams);
  const { videosQuery, createMutation, analyzeMutation, refresh } = useCompetitorVideos(filters.query);
  const [editing, setEditing] = useState<StudioCompetitorVideo | null>(null);
  const openAnalysisId = searchParams.get(ANALYSIS_PARAM);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const videos = videosQuery.data?.items ?? [];
  const selectedId = searchParams.get('video');
  const selectedVideo = videos.find((video) => video.awemeId === selectedId || video.latestAnalysis?.analysisId === openAnalysisId);
  const selectedQuery = useQuery({ queryKey: ['competitor-selected-video', selectedId],
    queryFn: ({ signal }) => fetchCompetitorVideo(selectedId!, signal), enabled: Boolean(openAnalysisId && selectedId && !selectedVideo),
  });
  const openVideo = selectedVideo ?? selectedQuery.data ?? null;

  const openAnalysis = (analysisId: string | null, awemeId?: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (analysisId) {
          next.set(ANALYSIS_PARAM, analysisId);
          if (awemeId) next.set('video', awemeId);
        }
        else { next.delete(ANALYSIS_PARAM); next.delete('video'); }
        return next;
      },
      { replace: !analysisId },
    );
  };

  const analyze = (awemeId: string, onQueued?: (analysisId: string) => void) => {
    setAnalyzing(awemeId);
    setAnalyzeError(null);
    analyzeMutation.mutate(awemeId, {
      onSuccess: (analysis) => onQueued?.(analysis.analysisId),
      onError: (error) => setAnalyzeError(errorText(error)),
      onSettled: () => setAnalyzing(null),
    });
  };

  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">{COMPETITOR_PAGE_TITLE}</h1>
          <p>{COMPETITOR_PAGE_PURPOSE}</p>
        </div>
        <Tooltip title={canWrite ? undefined : '当前账号没有素材编辑权限'}>
          <Button ref={addTrigger} type="primary" icon={<Plus size={16} />} disabled={!canWrite} onClick={() => setAdding(true)}>
            添加视频
          </Button>
        </Tooltip>
      </header>
      {notice ? <Alert type="success" showIcon closable title={notice} onClose={() => setNotice(null)} /> : null}
      <CompetitorVideoFilters source={filters.source} selection={filters.selection} period={videosQuery.data?.period ?? undefined}
        onSource={(source) => setSearchParams((params) => changeVideoFilters(params, { source }))}
        onSelection={(selection) => setSearchParams((params) => changeVideoFilters(params, { selection }))} />
      <article className={pageStyles.card} aria-labelledby="competitor-videos-title">
        <div className={styles.cardHeading}>
          <h2 id="competitor-videos-title" className={competitorStyles.cardTitle}>
            竞品视频
            {videosQuery.data ? <span className={competitorStyles.count}>{videosQuery.data.total}</span> : null}
          </h2>
          <RefreshButton onRefresh={() => void refresh()} loading={videosQuery.isFetching} />
        </div>
        <p className={competitorStyles.syncMeta}>
          {videosQuery.isPending ? '正在读取同步记录…' : videosQuery.isError ? '同步记录暂不可用' : videosQuery.data?.latestSyncAt ? `最近同步 ${formatShortTimestamp(videosQuery.data.latestSyncAt)}` : '暂无罗盘同步记录'}
          {videosQuery.data?.latestRankingDate ? ` · 最新榜单 ${videosQuery.data.latestRankingDate}` : ''}
        </p>
        {videosQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="竞品视频读取失败"
            description={errorText(videosQuery.error)}
            action={<Button onClick={() => void refresh()}>重试</Button>}
          />
        ) : null}
        {analyzeError ? (
          <Alert type="error" showIcon closable title="分析没有发起" description={analyzeError} onClose={() => setAnalyzeError(null)} />
        ) : null}
        <CompetitorVideoList
          videos={videos}
          loading={videosQuery.isPending}
          canWrite={canWrite}
          openAnalysisId={openAnalysisId}
          analyzing={analyzing}
          onOpen={openAnalysis}
          onEdit={setEditing}
          page={videosQuery.data?.page ?? filters.page}
          total={videosQuery.data?.total ?? 0}
          onPageChange={(page) => setSearchParams((params) => changeVideoFilters(params, { page }))}
          onAnalyze={(awemeId) => analyze(awemeId)}
        />
      </article>

      <CompetitorAddModal
        open={adding && canWrite}
        onClose={() => setAdding(false)}
        onAfterClose={() => { if (!openAnalysisId) addTrigger.current?.focus(); }}
        onSubmit={async (request, analyzeNow) => {
          const video = await createMutation.mutateAsync(request);
          let analysis = video.latestAnalysis;
          // Re-pasting a collected film must never retry a paid analysis.
          if (analyzeNow && !analysis) {
            try {
              analysis = { ...await analyzeMutation.mutateAsync(video.awemeId), complete: false };
            } catch (error) {
              throw new Error(`视频已添加，但分析未发起：${errorText(error)}`);
            }
          }
          const outcome = video.addOutcome === 'existing' ? '已存在，已保留原有资料' : '已添加';
          setNotice(`${outcome}「${competitorVideoTitle(video)}」。${isAnalysisActive(analysis) ? '分析正在排队或进行中。' : ''}`);
          setAdding(false);
          if (analyzeNow && analysis) openAnalysis(analysis.analysisId, video.awemeId);
        }}
      />

      {editing ? <CompetitorVideoEdit key={editing.awemeId} video={editing} onClose={() => setEditing(null)} /> : null}
      <CompetitorAnalysisDrawer
        analysisId={openAnalysisId}
        video={openVideo}
        canWrite={canWrite}
        reanalyzing={openVideo !== null && analyzing === openVideo.awemeId}
        onReanalyze={openVideo ? () => analyze(openVideo.awemeId, openAnalysis) : undefined}
        onClose={() => openAnalysis(null)}
      />
    </section>
  );
}
