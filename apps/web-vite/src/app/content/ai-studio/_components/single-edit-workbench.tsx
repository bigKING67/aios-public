import { Alert, Button, Popconfirm, Select, Skeleton } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { useAuthStore } from '@/stores/auth.store';
import type { StudioCapabilitiesResponse, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { newRemixIdempotencyKey } from '../_lib/remix-api';
import {
  SINGLE_EDIT_PURPOSE,
  buildEditCheckRequest,
  clipFromSegment,
  clipsFromOriginal,
  clipsFromOutput,
  editBlocker,
  editProduct,
  editTotalMs,
  loadEditDraft,
  moveClip,
  replaceClip,
  saveEditDraft,
  usableEditSegments,
  type EditClip,
  type EditSegment,
} from '../_lib/remix-edit';
import { buildRemixBatchPath, EDIT_FROM_BATCH_PARAM, EDIT_FROM_ORDINAL_PARAM } from '../_lib/remix-routes';
import { readStudioConflict } from '../_lib/segment-errors';
import { pickDefaultPreset, presetDisplayName } from '../_lib/segment-display';
import { EditingModeTabs } from './editing-mode-tabs';
import { RemixRecentBatches } from './remix-recent-batches';
import { EditLaunchCard } from './single-edit-launch';
import { OriginalStartModal, OutputStartModal, SegmentLibraryDrawer } from './single-edit-pickers';
import { ClipEditor, EditStartChooser, EditTimeline, type EditStartKind } from './single-edit-timeline';
import { useStudioPresets } from './use-ai-studio-queries';
import { useCreateRemixEdit, useRemixBatch, useRemixConfirmedSegments, useRemixEditCheck } from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';
import editStyles from './single-edit.module.css';
import workbenchStyles from './studio-workbench.module.css';

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * AI 剪辑 in single mode: pick a starting point, edit one output on the 剪辑台
 * and generate it after the duplicate check. Off when the remix capability is.
 */
export function SingleEditPanel({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const enabled = capabilities.remixEnabled;
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">AI 剪辑</h1>
          <p>{SINGLE_EDIT_PURPOSE}</p>
        </div>
        <div className={remixStyles.headerEnd}>
          {enabled ? null : <Badge status="neutral">尚未启用</Badge>}
          <EditingModeTabs remix={false} />
        </div>
      </header>
      {enabled ? (
        <SingleEditPresets capabilities={capabilities} />
      ) : (
        <article className={pageStyles.card}>
          <h2>单条剪辑未启用</h2>
          <p>当前环境没有开启成片渲染，本页不会创建任何渲染任务。在此之前可以先在片段素材页确认片段。</p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={ROUTE_PATHS.contentAiStudioSegments}>
              去片段素材
            </RouterLink>
          </div>
        </article>
      )}
    </section>
  );
}

function SingleEditPresets({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const userKey = String(useAuthStore((state) => state.user?.id) ?? '');
  const presetsQuery = useStudioPresets(true);
  const [presetId, setPresetId] = useState<string | null>(null);
  const presets = presetsQuery.data ?? [];
  const preset = presets.find((item) => `${item.presetKey}:${item.version}` === presetId) ?? pickDefaultPreset(presets);
  if (presetsQuery.isPending) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (presetsQuery.isError || !preset) {
    return <Alert type="error" showIcon title="分类预设读取失败" description="请刷新后重试。" />;
  }
  const id = `${preset.presetKey}:${preset.version}`;
  const presetSelect =
    presets.length > 1 ? (
      <Select
        aria-label="分类预设"
        className={styles.presetSelect}
        value={id}
        options={presets.map((item) => ({ value: `${item.presetKey}:${item.version}`, label: presetDisplayName(item) }))}
        onChange={setPresetId}
      />
    ) : null;
  // A preset or account switch starts a fresh board (each keeps its own draft).
  return <SingleEditBoard key={`${id}:${userKey}`} capabilities={capabilities} preset={preset} presets={presets} presetSelect={presetSelect} />;
}

type Picker = { kind: EditStartKind } | { kind: 'replace'; key: string } | null;

interface SingleEditBoardProps {
  capabilities: StudioCapabilitiesResponse;
  preset: StudioSegmentPreset;
  presets: readonly StudioSegmentPreset[];
  presetSelect: React.ReactNode;
}

function SingleEditBoard({ capabilities, preset, presets, presetSelect }: SingleEditBoardProps) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canWrite = capabilities.canWrite;
  const userId = useAuthStore((state) => state.user?.id);
  const owner = userId === undefined || userId === null || userId === '' ? null : String(userId);
  const [clips, setClipsState] = useState<EditClip[]>(() => loadEditDraft(preset, owner, browserStorage()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  // One key per edit; kept after an ambiguous failure so a retry is idempotent.
  const [idempotencyKey, setIdempotencyKey] = useState(newRemixIdempotencyKey);
  const create = useCreateRemixEdit();

  const segmentsQuery = useRemixConfirmedSegments(preset, true);
  const usable = useMemo(
    () => usableEditSegments<EditSegment>(segmentsQuery.data?.items ?? [], preset.version),
    [segmentsQuery.data, preset.version],
  );
  const segmentMap = useMemo(() => new Map(usable.map((segment) => [segment.segmentId, segment])), [usable]);

  // Frozen while a create is in flight (see the framework remix form for why).
  const setClips = (next: EditClip[], select?: string | null) => {
    if (create.isPending) return;
    setClipsState(next);
    if (select !== undefined) setSelectedKey(select);
    setAllowDuplicate(false);
    create.reset();
    setIdempotencyKey(newRemixIdempotencyKey());
  };

  useEffect(() => saveEditDraft(preset, owner, clips, browserStorage()), [preset, owner, clips]);

  // 成片 → 「以此为起点编辑」 loads that output once, then drops the link parameters;
  // a missing batch or output is reported instead of silently ignored.
  const fromBatch = params.get(EDIT_FROM_BATCH_PARAM);
  const fromOrdinal = Number(params.get(EDIT_FROM_ORDINAL_PARAM));
  const { query: fromDetail } = useRemixBatch(fromBatch);
  const [fromError, setFromError] = useState<string | null>(null);
  useEffect(() => {
    if (!fromBatch || (!fromDetail.data && !fromDetail.isError)) return;
    const batch = fromDetail.data?.batch;
    const otherPreset =
      batch && (batch.presetKey !== preset.presetKey || batch.presetVersion !== preset.version) ? batch : null;
    const item = otherPreset ? undefined : fromDetail.data?.items.find((entry) => entry.ordinal === fromOrdinal);
    if (item) {
      const next = clipsFromOutput(item.segments);
      setClipsState(next);
      setSelectedKey(next[0]?.key ?? null);
      setFromError(null);
    } else {
      setFromError(
        fromDetail.isError
          ? '没能读取这条成片（可能已删除或无权查看），剪辑台保持原样。'
          : otherPreset
            ? `这条成片用的是分类预设 v${otherPreset.presetVersion}，请在剪辑台切换到同一预设后再从成片开始。`
            : `批次里没有第 ${fromOrdinal} 条成片，剪辑台保持原样。`,
      );
    }
    const rest = new URLSearchParams(params);
    rest.delete(EDIT_FROM_BATCH_PARAM);
    rest.delete(EDIT_FROM_ORDINAL_PARAM);
    setParams(rest, { replace: true });
  }, [fromBatch, fromOrdinal, fromDetail.data, fromDetail.isError, params, setParams, preset.presetKey, preset.version]);

  const productName = editProduct(clips, segmentMap);
  const segmentsReady = segmentsQuery.isSuccess;
  const blocker = segmentsReady
    ? editBlocker(clips, segmentMap, capabilities.remixMaxSeconds)
    : segmentsQuery.isError
      ? '片段读取失败，请刷新后重试。'
      : '正在读取片段…';
  const { query: check, settled } = useRemixEditCheck(blocker ? null : buildEditCheckRequest(preset, clips));
  const staleIds = new Set(
    readStudioConflict(check.error)?.code === 'source_changed' ? (readStudioConflict(check.error)?.segmentIds ?? []) : [],
  );

  const selectedIndex = clips.findIndex((clip) => clip.key === selectedKey);
  const selected = selectedIndex >= 0 ? clips[selectedIndex] : null;
  const replacing = picker?.kind === 'replace' ? clips.find((clip) => clip.key === picker.key) ?? null : null;

  const startFrom = (next: EditClip[]) => {
    setClips(next, next[0]?.key ?? null);
    setPicker(null);
  };

  const pickSegment = (segment: EditSegment) => {
    if (replacing) {
      setClips(replaceClip(clips, replacing.key, segment));
      setPicker(null);
      return;
    }
    const clip = clipFromSegment(segment);
    setClips([...clips, clip], clip.key);
  };

  const submit = () => {
    create.mutate(
      { ...buildEditCheckRequest(preset, clips), idempotencyKey, allowDuplicate },
      { onSuccess: (detail) => navigate(buildRemixBatchPath(detail.batch.batchId)) },
    );
  };

  const replaceStart = (kind: 'output' | 'original', label: string) => (
    <Popconfirm
      title="换一个起点？"
      description={`会替换剪辑台上当前的 ${clips.length} 段。`}
      okText="替换"
      cancelText="取消"
      onConfirm={() => setPicker({ kind })}
      disabled={clips.length === 0}
    >
      <Button size="small" disabled={!canWrite} onClick={clips.length === 0 ? () => setPicker({ kind }) : undefined}>
        {label}
      </Button>
    </Popconfirm>
  );

  return (
    <div className={workbenchStyles.layout}>
      <article className={pageStyles.card} aria-labelledby="edit-board-title">
        <div className={styles.cardHeading}>
          <h2 id="edit-board-title">剪辑台</h2>
          <span className={editStyles.boardActions}>
            {presetSelect}
            {clips.length > 0 ? (
              <>
                {replaceStart('output', '从成片开始')}
                {replaceStart('original', '从原片开始')}
                <Popconfirm title="清空剪辑台？" okText="清空" cancelText="取消" onConfirm={() => setClips([], null)}>
                  <Button size="small" disabled={!canWrite}>
                    清空
                  </Button>
                </Popconfirm>
              </>
            ) : null}
          </span>
        </div>
        {!canWrite ? <Alert type="info" showIcon title="当前账号没有素材编辑权限，只能查看。" /> : null}
        {segmentsQuery.isError ? <Alert type="error" showIcon title="片段读取失败，请刷新后重试。" /> : null}
        {fromBatch && fromDetail.isPending ? <Skeleton active paragraph={{ rows: 2 }} title={false} /> : null}
        {fromError ? (
          <Alert type="warning" showIcon title="没有载入成片" description={fromError} closable={{ onClose: () => setFromError(null) }} />
        ) : null}
        {clips.length === 0 ? (
          <EditStartChooser disabled={!canWrite} onStart={(kind) => setPicker({ kind })} />
        ) : (
          <>
            <EditTimeline
              preset={preset}
              clips={clips}
              segments={segmentsReady ? segmentMap : new Map()}
              selectedKey={selectedKey}
              highlightIds={staleIds}
              disabled={!canWrite}
              onSelect={setSelectedKey}
              onAdd={() => setPicker({ kind: 'library' })}
            />
            {selected ? (
              <ClipEditor
                key={selected.key}
                preset={preset}
                clip={selected}
                index={selectedIndex}
                count={clips.length}
                segment={segmentsReady ? segmentMap.get(selected.segmentId) : undefined}
                disabled={!canWrite}
                onChange={(clip) => setClips(clips.map((item) => (item.key === clip.key ? clip : item)))}
                onMove={(delta) => setClips(moveClip(clips, selectedIndex, delta))}
                onReplace={() => setPicker({ kind: 'replace', key: selected.key })}
                onRemove={() => {
                  const next = clips.filter((clip) => clip.key !== selected.key);
                  setClips(next, next[Math.min(selectedIndex, next.length - 1)]?.key ?? null);
                }}
              />
            ) : (
              <p className={styles.fieldHelp}>点选一段可以修剪入出点、预览、调整位置、替换或删除。</p>
            )}
          </>
        )}
      </article>

      <aside className={workbenchStyles.side}>
        <EditLaunchCard
          presetVersion={preset.version}
          productName={productName}
          clipCount={clips.length}
          totalMs={editTotalMs(clips)}
          maxSeconds={capabilities.remixMaxSeconds}
          canWrite={canWrite}
          blocker={blocker}
          check={{ data: settled ? check.data : undefined, pending: !settled || check.isFetching, error: check.error }}
          allowDuplicate={allowDuplicate}
          onAllowDuplicate={setAllowDuplicate}
          creating={create.isPending}
          createError={create.error}
          onCreate={submit}
        />
        <RemixRecentBatches presets={presets} openAccess={capabilities.openAccess} mode="edit" />
      </aside>

      <OutputStartModal
        open={picker?.kind === 'output'}
        preset={preset}
        presets={presets}
        onPick={(item) => startFrom(clipsFromOutput(item.segments))}
        onClose={() => setPicker(null)}
      />
      <OriginalStartModal
        open={picker?.kind === 'original'}
        preset={preset}
        segments={usable}
        loading={segmentsQuery.isPending}
        error={segmentsQuery.isError}
        truncated={segmentsQuery.data?.truncated ?? false}
        onPick={(option) => startFrom(clipsFromOriginal(usable, option.assetId))}
        onClose={() => setPicker(null)}
      />
      <SegmentLibraryDrawer
        open={picker?.kind === 'library' || picker?.kind === 'replace'}
        preset={preset}
        segments={usable}
        loading={segmentsQuery.isPending}
        error={segmentsQuery.isError}
        truncated={segmentsQuery.data?.truncated ?? false}
        productName={productName}
        replacing={replacing ? { labelKey: segmentMap.get(replacing.segmentId)?.labelKey ?? null } : null}
        onPick={pickSegment}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
