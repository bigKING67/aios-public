import { ArrowLeftOutlined, ExportOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm, Select, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { resolveContentAssetDisplayTitle, resolveContentAssetProductText } from '@/app/marketing/content-assets/_lib/content-assets-display';
import { formatDuration } from '@/app/marketing/content-assets/_lib/content-assets-formatters';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { buildContentAssetDetailPath } from '../_lib/remix-routes';
import { findPreset, isSegmentReadOnly, presetDisplayName, SEGMENT_STATUS_OPTIONS } from '../_lib/segment-display';
import { SegmentCreateForm } from './segment-create-form';
import { SegmentEditModal } from './segment-edit-modal';
import { SegmentSourcePlayer } from './segment-source-player';
import { type SegmentRowAction, SegmentTable } from './segment-table';
import { SegmentTimeline } from './segment-timeline';
import { useRangePlayback } from './use-range-playback';
import { useSegmentAnnotation } from './use-segment-annotation';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';

/** Status filter value: every segment except rejected ones (the default view). */
const ACTIVE_STATUSES = 'active';

interface SegmentAnnotationViewProps {
  assetId: string;
  focusSegmentId: string | null;
  canWrite: boolean;
  /** Open studio access: studio writes do not depend on the asset's `canEdit`. */
  openAccess: boolean;
  presets: readonly StudioSegmentPreset[];
  preset: StudioSegmentPreset;
  onPresetChange: (presetKey: string) => void;
}

export function SegmentAnnotationView({ assetId, focusSegmentId, canWrite, openAccess, presets, preset, onPresetChange }: SegmentAnnotationViewProps) {
  const annotation = useSegmentAnnotation(assetId, preset, presets);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useRangePlayback(videoRef);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(focusSegmentId);
  const [editing, setEditing] = useState<StudioContentSegment | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Rejected rows (including superseded AI suggestions) are hidden until asked for.
  const [statusFilter, setStatusFilter] = useState<string>(ACTIVE_STATUSES);

  useEffect(() => setActiveSegmentId(focusSegmentId), [focusSegmentId]);
  const { segments } = annotation;
  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => segments.some((segment) => segment.segmentId === id && segment.status === 'suggested')));
  }, [segments]);

  const highlightedIds = useMemo(
    () => new Set(annotation.notice?.tone === 'error' ? annotation.notice.error.segmentIds : []),
    [annotation.notice],
  );

  if (annotation.assetQuery.isPending) {
    return <div className={pageStyles.card} aria-busy="true"><Skeleton active paragraph={{ rows: 6 }} /></div>;
  }
  if (annotation.assetQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="无法读取原片"
        description={annotation.assetQuery.error instanceof Error ? annotation.assetQuery.error.message : '请求失败'}
        action={<Button onClick={() => void annotation.assetQuery.refetch()}>重试</Button>}
      />
    );
  }

  const asset = annotation.assetQuery.data.asset;
  const writable = canWrite && (openAccess || asset.canEdit);
  const assetDurationMs = asset.durationSeconds ? Math.round(asset.durationSeconds * 1000) : null;
  const assetProduct = resolveContentAssetProductText(asset);
  // The original may have no product of its own while its confirmed segments do.
  const segmentProduct = assetProduct
    ? null
    : segments.find((segment) => segment.status === 'confirmed' && segment.productName)?.productName ?? null;
  const maxEnd = segments.reduce((max, segment) => Math.max(max, segment.endMs), 0);
  const timelineDurationMs = Math.max(assetDurationMs ?? mediaDurationMs ?? 0, maxEnd);
  const canPlay = !asset.externalOnly && Boolean(asset.rawObjectKey || asset.previewObjectKey);
  const visibleSegments =
    statusFilter === ACTIVE_STATUSES
      ? segments.filter((segment) => segment.status !== 'rejected')
      : statusFilter
        ? segments.filter((segment) => segment.status === statusFilter)
        : segments;
  const selected = segments.filter(
    (segment) => selectedIds.includes(segment.segmentId) && segment.status === 'suggested' && !isSegmentReadOnly(segment),
  );
  const activePresets = presets.filter((item) => item.status === 'active');

  const selectSegment = (segment: StudioContentSegment) => {
    setActiveSegmentId(segment.segmentId);
    playback.playRange(segment.startMs, segment.endMs);
  };

  const handleAction = (action: SegmentRowAction) => {
    if (action.type === 'play') return selectSegment(action.segment);
    if (action.type === 'edit') return setEditing(action.segment);
    setActiveSegmentId(action.segment.segmentId);
    void annotation.updateSegment(action.segment, { expectedRevision: action.segment.revision, status: action.status });
  };

  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <RouterLink className={styles.backLink} to={ROUTE_PATHS.contentAiStudioSegments}>
            <ArrowLeftOutlined aria-hidden /> 片段素材
          </RouterLink>
          <h1 id="ai-studio-page-title">标注片段 · {resolveContentAssetDisplayTitle(asset)}</h1>
          <p>
            产品 {assetProduct || (segmentProduct ? `未填写（片段标注为 ${segmentProduct}）` : '--')} · 时长 {formatDuration(asset.durationSeconds)}
            {assetDurationMs === null ? '（原片时长未校验，出点按播放器时长参考）' : ''}
          </p>
        </div>
        <RouterLink className={styles.secondaryLink} to={buildContentAssetDetailPath(asset.assetId)}>
          在素材库打开 <ExportOutlined aria-hidden />
        </RouterLink>
      </header>

      {!writable ? (
        <Alert
          type="info"
          showIcon
          title={canWrite ? '你没有这条原片的编辑权限，只能查看片段。' : '你只有查看权限，不能新建或修改片段。'}
        />
      ) : null}

      <div className={styles.workspace}>
        <article className={pageStyles.card}>
          <h2>原片</h2>
          <SegmentSourcePlayer
            asset={asset}
            videoRef={videoRef}
            onTimeUpdate={playback.onTimeUpdate}
            onSeeking={playback.onSeeking}
            onDurationChange={setMediaDurationMs}
          />
        </article>
        <article className={pageStyles.card}>
          <div className={styles.cardHeading}>
            <h2>新建片段</h2>
            {activePresets.length > 1 ? (
              <Select
                aria-label="分类预设"
                className={styles.presetSelect}
                value={preset.presetKey}
                options={activePresets.map((item) => ({ value: item.presetKey, label: presetDisplayName(item) }))}
                onChange={onPresetChange}
              />
            ) : (
              <span className={styles.presetName}>{presetDisplayName(preset)}</span>
            )}
          </div>
          {writable ? (
            <SegmentCreateForm
              preset={preset}
              assetProductName={asset.productName}
              durationMs={assetDurationMs}
              busy={annotation.busy}
              readCurrentMs={canPlay ? playback.readCurrentMs : null}
              onSubmit={annotation.createSegment}
            />
          ) : (
            <p className={styles.fieldHelp}>当前为只读视图。</p>
          )}
        </article>
      </div>

      {annotation.notice ? (
        <Alert
          key={annotation.noticeId}
          type={annotation.notice.tone === 'success' ? 'success' : 'error'}
          showIcon
          closable={{ onClose: annotation.clearNotice }}
          title={annotation.notice.tone === 'success' ? annotation.notice.text : annotation.notice.error.message}
        />
      ) : null}

      <article className={pageStyles.card}>
        <div className={styles.cardHeading}>
          <h2>片段时间轴</h2>
          <span className={styles.fieldHelp}>
            {canPlay ? '点击色块播放该片段（到出点自动暂停）；点击刻度从该时间播放。' : '点击色块定位该片段。'}
          </span>
        </div>
        {annotation.segmentsQuery.isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
        {annotation.segmentsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="片段读取失败"
            action={<Button onClick={() => void annotation.segmentsQuery.refetch()}>重试</Button>}
          />
        ) : null}
        {annotation.segmentsQuery.isSuccess ? (
          <SegmentTimeline
            segments={segments}
            presets={presets}
            durationMs={timelineDurationMs}
            currentMs={playback.currentMs}
            activeSegmentId={activeSegmentId}
            highlightedIds={highlightedIds}
            onSelect={selectSegment}
            onSeek={canPlay ? playback.seekTo : undefined}
          />
        ) : null}
        {annotation.truncated ? <p className={styles.fieldHelp}>片段较多，只显示前 1000 条。</p> : null}
      </article>

      <article className={pageStyles.card}>
        <div className={styles.cardHeading}>
          <h2>片段列表</h2>
          <div className={styles.listToolbar}>
            <Select
              aria-label="按状态筛选"
              className={styles.statusSelect}
              value={statusFilter}
              options={[
                { value: ACTIVE_STATUSES, label: '未拒绝' },
                { value: '', label: '全部状态' },
                ...SEGMENT_STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
              ]}
              onChange={setStatusFilter}
            />
            {writable ? (
              <Popconfirm
                title={`确认所选 ${selected.length} 条片段？`}
                description="全部成功或全部不生效：任意一条与已确认片段重叠、已被修改或原片已变化，本次不会确认任何片段。"
                okText="确认"
                cancelText="取消"
                disabled={selected.length === 0}
                onConfirm={() => void annotation.confirmSegments(selected)}
              >
                <Button type="primary" className={styles.touchButton} disabled={selected.length === 0 || annotation.busy}>
                  批量确认{selected.length > 0 ? ` ${selected.length} 条` : ''}
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        </div>
        {writable ? <p className={styles.fieldHelp}>只能勾选待确认片段。批量确认是整批生效：有一条失败，全部不确认。</p> : null}
        <SegmentTable
          segments={visibleSegments}
          presets={presets}
          canWrite={writable}
          canPlay={canPlay}
          busy={annotation.busy}
          activeSegmentId={activeSegmentId}
          highlightedIds={highlightedIds}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onAction={handleAction}
        />
      </article>

      <SegmentEditModal
        segment={editing && !isSegmentReadOnly(editing) ? editing : null}
        preset={editing ? findPreset(presets, editing.presetKey, editing.presetVersion) : undefined}
        durationMs={assetDurationMs}
        busy={annotation.busy}
        onCancel={() => setEditing(null)}
        onSubmit={annotation.updateSegment}
      />
    </section>
  );
}
