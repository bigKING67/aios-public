import { FileImageOutlined, PlayCircleFilled, VideoCameraOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Modal, Select, Skeleton } from 'antd';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/atoms/badge';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import type { EditSegment } from '../_lib/remix-edit';
import { remixItemStatusView, type StudioRemixBatchItem } from '../_lib/remix-api';
import { referenceAssetOptions, remixBatchStructureText, shortAssetTitle, type ReferenceAssetOption } from '../_lib/remix-form';
import { labelName, presetDisplayName } from '../_lib/segment-display';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import { formatShortTimestamp } from '../_lib/studio-time';
import { RemixReferencePicker } from './remix-reference-picker';
import { SegmentRangePlayer } from './remix-candidates';
import { useRemixBatch, useRemixBatches } from './use-remix-batches';
import styles from './segment-annotation.module.css';
import editStyles from './single-edit.module.css';

const COMPACT_QUERY = '(max-width: 680px)';
const LIBRARY_PAGE = 60;

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

interface OutputStartModalProps {
  open: boolean;
  /** Only outputs built from this preset version can be edited on this 剪辑台. */
  preset: StudioSegmentPreset;
  presets: readonly StudioSegmentPreset[];
  onPick: (item: StudioRemixBatchItem) => void;
  onClose: () => void;
}

/** 起点 A: pick a batch with outputs, then one finished output of it. */
export function OutputStartModal({ open, preset, presets, onPick, onClose }: OutputStartModalProps) {
  const [batchId, setBatchId] = useState<string | null>(null);
  const { query: batches } = useRemixBatches(open);
  const { query: detail } = useRemixBatch(open ? batchId : null);
  const withOutputs = (batches.data ?? []).filter(
    (batch) =>
      batch.succeededCount > 0 && batch.presetKey === preset.presetKey && batch.presetVersion === preset.version,
  );
  const close = () => {
    setBatchId(null);
    onClose();
  };
  const pick = (item: StudioRemixBatchItem) => {
    setBatchId(null);
    onPick(item);
  };

  let body;
  if (batchId) {
    const items = (detail.data?.items ?? []).filter((item) => item.outcome === 'succeeded');
    body = detail.isPending ? (
      <Skeleton active paragraph={{ rows: 3 }} title={false} />
    ) : detail.isError ? (
      <Alert type="error" showIcon title="成片读取失败" description={errorText(detail.error)} />
    ) : items.length === 0 ? (
      <p className={styles.fieldHelp}>这个批次没有已完成的成片。</p>
    ) : (
      <ul className={editStyles.outputGrid} aria-label="选择一条成片">
        {items.map((item) => (
          <li key={item.ordinal}>
            <button type="button" className={editStyles.pickCard} onClick={() => pick(item)}>
              <span className={editStyles.pickCover}>
                {item.outputCoverUrl ? <img src={item.outputCoverUrl} alt="" loading="lazy" /> : <VideoCameraOutlined aria-hidden />}
              </span>
              <span className={editStyles.pickBody}>
                <span className={editStyles.pickTitle}>第 {item.ordinal} 条</span>
                <span className={editStyles.pickMeta}>
                  {item.segments.length} 段 · {formatSegmentDuration(0, item.durationMs)} · {remixItemStatusView(item).label}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else {
    body = batches.isPending ? (
      <Skeleton active paragraph={{ rows: 4 }} title={false} />
    ) : batches.isError ? (
      <Alert type="error" showIcon title="成片读取失败" description={errorText(batches.error)} />
    ) : withOutputs.length === 0 ? (
      <p className={styles.fieldHelp}>当前分类预设（{presetDisplayName(preset)}）下还没有已完成的成片。可以改用「精剪一条原片」或「从片段库挑着拼」。</p>
    ) : (
      <ul className={editStyles.batchList} aria-label="选择成片批次">
        {withOutputs.map((batch) => (
          <li key={batch.batchId}>
            <button type="button" className={editStyles.pickCard} onClick={() => setBatchId(batch.batchId)}>
              <span className={editStyles.pickCover}>
                {batch.coverUrls[0] ? <img src={batch.coverUrls[0]} alt="" loading="lazy" /> : <VideoCameraOutlined aria-hidden />}
              </span>
              <span className={editStyles.pickBody}>
                <span className={editStyles.pickTitle}>
                  {batch.productName}
                  <Badge status="neutral">{batch.mode === 'edit' ? '单条' : '框架混剪'}</Badge>
                </span>
                <span className={editStyles.pickChain}>{remixBatchStructureText(batch, presets)}</span>
                <span className={editStyles.pickMeta}>
                  {batch.succeededCount} 条成片 · {formatShortTimestamp(batch.createdAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal
      open={open}
      title={batchId ? '选一条成片作为起点' : '改一条已有成片'}
      footer={batchId ? <Button onClick={() => setBatchId(null)}>返回批次列表</Button> : null}
      width={640}
      destroyOnHidden
      onCancel={close}
    >
      <div className={editStyles.pickerBody}>{body}</div>
    </Modal>
  );
}

interface OriginalStartModalProps {
  open: boolean;
  preset: StudioSegmentPreset;
  segments: readonly EditSegment[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
  onPick: (option: ReferenceAssetOption) => void;
  onClose: () => void;
}

/** 起点 B: pick an original with confirmed segments. */
export function OriginalStartModal({ open, preset, segments, loading, error, truncated, onPick, onClose }: OriginalStartModalProps) {
  const references = useMemo(() => referenceAssetOptions(segments), [segments]);
  return (
    <Modal open={open} title="精剪一条原片" footer={null} width={720} destroyOnHidden onCancel={onClose}>
      <div className={editStyles.pickerBody}>
        <p className={styles.fieldHelp}>选一条原片，按时间顺序载入它的已确认片段，再删减或修剪。</p>
        <RemixReferencePicker
          preset={preset}
          references={references}
          loading={loading}
          error={error}
          truncated={truncated}
          selectedId={null}
          disabled={false}
          onPick={onPick}
          onClear={() => undefined}
        />
      </div>
    </Modal>
  );
}

interface SegmentLibraryDrawerProps {
  open: boolean;
  preset: StudioSegmentPreset;
  segments: readonly EditSegment[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
  /** The edit's product; null until the first clip is chosen. */
  productName: string | null;
  /** Replacing a clip: the button reads 替换 and the framework filter starts on its label. */
  replacing: { labelKey: string | null } | null;
  onPick: (segment: EditSegment) => void;
  onClose: () => void;
}

/** 起点 C and 替换: confirmed segments of the edit's product, filterable by framework. */
export function SegmentLibraryDrawer(props: SegmentLibraryDrawerProps) {
  const compact = useMediaQuery(COMPACT_QUERY);
  return (
    <Drawer
      open={props.open}
      title={props.replacing ? '替换片段' : '从片段库添加'}
      placement="right"
      size={compact ? '100%' : 560}
      destroyOnHidden
      onClose={props.onClose}
    >
      {props.open ? <SegmentLibrary {...props} /> : null}
    </Drawer>
  );
}

function SegmentLibrary({ preset, segments, loading, error, truncated, productName, replacing, onPick }: SegmentLibraryDrawerProps) {
  const [labelKey, setLabelKey] = useState<string | null>(replacing?.labelKey ?? null);
  const [limit, setLimit] = useState(LIBRARY_PAGE);
  const [playing, setPlaying] = useState<EditSegment | null>(null);

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} title={false} />;
  if (error) return <Alert type="error" showIcon title="片段读取失败，请刷新后重试。" />;

  const sameProduct = productName ? segments.filter((segment) => segment.productName?.trim() === productName) : segments;
  const visible = labelKey ? sameProduct.filter((segment) => segment.labelKey === labelKey) : sameProduct;
  const labels = preset.labels.filter((label) => sameProduct.some((segment) => segment.labelKey === label.key));

  return (
    <div className={editStyles.library}>
      <div className={editStyles.libraryFilters}>
        <Select
          aria-label="按框架筛选"
          allowClear
          placeholder="全部框架"
          value={labelKey ?? undefined}
          options={labels.map((label) => ({ value: label.key, label: label.name }))}
          onChange={(value: string | undefined) => {
            setLabelKey(value ?? null);
            setLimit(LIBRARY_PAGE);
          }}
        />
        <span className={editStyles.libraryScope}>
          {productName ? `只显示「${productName}」的片段` : '选第一段后，只显示同一产品的片段'} · {visible.length} 段
        </span>
      </div>
      {visible.length === 0 ? (
        <p className={styles.fieldHelp}>没有符合条件的已确认片段。</p>
      ) : (
        <ul className={editStyles.libraryList} aria-label="可用片段">
          {visible.slice(0, limit).map((segment) => {
            const range = `${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)}`;
            return (
              <li key={segment.segmentId} className={editStyles.libraryItem}>
                <button
                  type="button"
                  className={editStyles.libraryCover}
                  onClick={() => setPlaying(segment)}
                  aria-label={`播放 ${segment.assetTitle} ${range}`}
                >
                  {segment.coverUrl ? <img src={segment.coverUrl} alt="" loading="lazy" /> : <FileImageOutlined aria-hidden />}
                  <PlayCircleFilled className={editStyles.libraryPlay} aria-hidden />
                </button>
                <span className={editStyles.pickBody}>
                  <span className={editStyles.pickTitle}>{labelName(preset, segment.labelKey)}</span>
                  <span className={editStyles.pickChain} title={segment.assetTitle}>{shortAssetTitle(segment.assetTitle)}</span>
                  <span className={editStyles.pickMeta}>
                    {range} · {formatSegmentDuration(segment.startMs, segment.endMs)}
                    {productName ? '' : ` · ${segment.productName ?? '未标注产品'}`}
                  </span>
                </span>
                <Button size="small" type={replacing ? 'primary' : 'default'} onClick={() => onPick(segment)}>
                  {replacing ? '替换为这段' : '添加'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > limit ? (
        <Button block onClick={() => setLimit((value) => value + LIBRARY_PAGE)}>
          显示更多（还有 {visible.length - limit} 段）
        </Button>
      ) : null}
      {truncated ? <p className={styles.fieldHelp}>已确认片段较多，只读取了前 1000 段。</p> : null}
      <Modal
        open={playing !== null}
        title={playing ? `${labelName(preset, playing.labelKey)} · ${shortAssetTitle(playing.assetTitle)}` : ''}
        footer={null}
        width={420}
        destroyOnHidden
        onCancel={() => setPlaying(null)}
      >
        {playing ? (
          <SegmentRangePlayer
            key={playing.segmentId}
            source={{ ...playing, label: `${playing.assetTitle} ${formatSegmentTime(playing.startMs)}–${formatSegmentTime(playing.endMs)}` }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
