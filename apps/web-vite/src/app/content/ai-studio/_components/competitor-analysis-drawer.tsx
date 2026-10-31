import { ExternalLink } from 'lucide-react';
import { Alert, Button, Drawer, SkeletonText } from '@lobehub/ui';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import type { ReactNode } from 'react';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  analysisFailureText,
  analysisStatusView,
  hasAnalysisCard,
  isAnalysisActive,
  promptVersionLabel,
  type StudioCompetitorAnalysis,
  type StudioCompetitorVideo,
} from '../_lib/competitor-api';
import {
  type CompetitorCard,
  type EvidenceMedia,
  formatClock,
  labelOf,
  readCompetitorCard,
  readEvidenceMedia,
} from '../_lib/competitor-card';
import { formatShortTimestamp } from '../_lib/studio-time';
import { SampleSheet, StructureView } from './competitor-structure';
import { useCompetitorAnalysis } from './use-competitor-videos';
import styles from './competitor.module.css';

const COMPACT_QUERY = '(max-width: 760px)';

interface CompetitorAnalysisDrawerProps {
  analysisId: string | null;
  video: StudioCompetitorVideo | null;
  canWrite: boolean;
  reanalyzing: boolean;
  onReanalyze?: () => void;
  onClose: () => void;
}

export function CompetitorAnalysisDrawer({ analysisId, video, canWrite, reanalyzing, onReanalyze, onClose }: CompetitorAnalysisDrawerProps) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const title = video?.title?.trim() || (video ? `抖音作品 ${video.awemeId}` : '竞品拆解');
  return (
    <Drawer open={analysisId !== null} title={title} placement="right" width={compact ? '100%' : 820} onClose={onClose}>
      {analysisId ? (
        <AnalysisBody analysisId={analysisId} video={video} canWrite={canWrite} reanalyzing={reanalyzing} onReanalyze={onReanalyze} />
      ) : null}
    </Drawer>
  );
}

function AnalysisBody({
  analysisId,
  video,
  canWrite,
  reanalyzing,
  onReanalyze,
}: Omit<CompetitorAnalysisDrawerProps, 'onClose' | 'analysisId'> & { analysisId: string }) {
  const query = useCompetitorAnalysis(analysisId);

  if (query.isPending) return <SkeletonText rows={8} />;
  if (query.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="拆解读取失败"
        description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  }

  const analysis = query.data;
  const card = hasAnalysisCard(analysis) ? readCompetitorCard(analysis.card) : null;
  const media = readEvidenceMedia(analysis.evidenceObjects);
  const canRetry = canWrite && !!onReanalyze && video?.latestAnalysis?.analysisId === analysis.analysisId;
  const retry = canRetry ? (
    <AiActionButton size="small" loading={reanalyzing} onClick={onReanalyze}>
      重新分析
    </AiActionButton>
  ) : null;
  const supplement = canRetry ? (
    <AiActionButton size="small" loading={reanalyzing} onClick={onReanalyze}>
      {card?.framework ? '重新生成框架和口播' : '补充框架和口播'}
    </AiActionButton>
  ) : null;

  return (
    <div className={styles.body}>
      {card ? <ProductHeading card={card} /> : null}
      <AnalysisMeta analysis={analysis} video={video} />
      {isAnalysisActive(analysis) ? (
        <AiTaskStatus
          state={analysisStatusView(analysis.status).state}
          stateLabel={analysisStatusView(analysis.status).label}
          label="正在下载原片并调用模型，通常 1–3 分钟完成，完成后这里会自动刷新"
        />
      ) : null}
      {analysis.status === 'failed' || analysis.status === 'cancelled' ? <FailureNotice analysis={analysis} action={retry} /> : null}
      {hasAnalysisCard(analysis) && !card ? <Alert type="warning" showIcon title="拆解卡片格式无法读取" /> : null}
      {card ? (
        <CardView
          card={card}
          analysis={analysis}
          media={media}
          awemeId={video?.awemeId ?? null}
          durationMs={video?.durationSeconds ? video.durationSeconds * 1000 : null}
          action={supplement}
        />
      ) : null}
    </div>
  );
}

/** 推广产品 first: what the film sells is the first thing the business reads. */
function ProductHeading({ card }: { card: CompetitorCard }) {
  const { brand, name, category } = card.product;
  if (!brand && !name && !category) return null;
  return (
    <p className={styles.product}>
      <span className={styles.fieldLabel}>推广产品</span>
      <strong>{[brand, name].filter(Boolean).join(' · ') || '未识别名称'}</strong>
      {category && category !== 'unknown' ? <span className={styles.chip}>{labelOf(card.labels, 'product_categories', category)}</span> : null}
    </p>
  );
}

function AnalysisMeta({ analysis, video }: { analysis: StudioCompetitorAnalysis; video: StudioCompetitorVideo | null }) {
  const view = analysisStatusView(analysis.status);
  const prompt = promptVersionLabel(analysis.promptVersion);
  return (
    <div className={styles.meta}>
      {/* Active and failed analyses carry their state in the task box below. */}
      {hasAnalysisCard(analysis) ? <AiTaskStatus compact state={view.state} stateLabel={view.label} /> : null}
      {video?.authorName ? <span>{video.authorName}</span> : null}
      {video?.durationSeconds ? <span className={styles.tabular}>时长 {formatClock(video.durationSeconds)}</span> : null}
      {/* Spend and prompt generation are audit details: one hover on the time, not two more chips. */}
      <span
        className={styles.tabular}
        title={
          [
            analysis.costYuan !== null ? `分析花费 ¥${analysis.costYuan.toFixed(3)}` : null,
            analysis.modelId ? `模型 ${analysis.modelId}` : null,
            prompt ? `AI 提示词 ${prompt}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        {formatShortTimestamp(analysis.finishedAt ?? analysis.createdAt)}
      </span>
      {video ? (
        <a className={styles.externalLink} href={video.shareUrl} target="_blank" rel="noreferrer noopener">
          抖音原片 <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">（新窗口打开）</span>
        </a>
      ) : null}
    </div>
  );
}

function FailureNotice({ analysis, action }: { analysis: StudioCompetitorAnalysis; action: ReactNode }) {
  const failure = analysisFailureText(analysis);
  const view = analysisStatusView(analysis.status);
  return (
    <AiTaskStatus
      state={view.state}
      stateLabel={analysis.status === 'cancelled' ? '分析已取消' : '分析失败'}
      label={failure.text}
      detail={failure.detail}
      action={action}
    />
  );
}

function hostErrorList(value: unknown): Array<{ severity: string; path: string; message: string }> {
  return Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({ severity: String(item.severity ?? ''), path: String(item.path ?? ''), message: String(item.message ?? '') }))
    : [];
}

interface CardViewProps {
  card: CompetitorCard;
  analysis: StudioCompetitorAnalysis;
  media: { samples: EvidenceMedia[] };
  awemeId: string | null;
  durationMs: number | null;
  action: ReactNode;
}

function CardView({ card, analysis, media, awemeId, durationMs, action }: CardViewProps) {
  const hostErrors = hostErrorList(analysis.hostErrors);
  const removed = hostErrors.filter((item) => item.severity === 'error');
  return (
    <>
      {analysis.status === 'partial' || card.analysisStatus !== 'complete' ? (
        <Alert
          type="warning"
          showIcon
          title={card.analysisStatus === 'complete' ? '部分内容未通过校验，已剔除' : '视频没有完整读取，结论只覆盖可见部分'}
          description={
            [...card.limitations, ...(removed.length ? [`已剔除 ${removed.length} 处对不上原片的引用`] : [])].join('；') || undefined
          }
        />
      ) : null}

      <section className={styles.section} aria-labelledby="competitor-summary">
        <h3 id="competitor-summary">拆解概要</h3>
        <p className={styles.lead}>{card.summary || '--'}</p>
        {card.purchaseQuestion ? (
          <p className={styles.question}>
            <span className={styles.fieldLabel}>打消的顾虑</span>
            {card.purchaseQuestion}
          </p>
        ) : null}
      </section>

      <StructureView key={analysis.analysisId} awemeId={awemeId} framework={card.framework} durationMs={durationMs} action={action} />
      {/* The sample frames are evidence: after the structure and the player, not between them. */}
      <SampleSheet samples={media.samples} />
    </>
  );
}
