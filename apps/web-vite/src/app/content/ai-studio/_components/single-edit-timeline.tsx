import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  FileImageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SwapOutlined,
  UndoOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Alert, Button, Modal, Slider } from 'antd';
import { useState } from 'react';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { EDIT_TRIM_STEP_MS, isClipTrimmed, trimClip, type EditClip, type EditSegment } from '../_lib/remix-edit';
import { shortAssetTitle } from '../_lib/remix-form';
import { labelName } from '../_lib/segment-display';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import { SegmentRangePlayer } from './remix-candidates';
import editStyles from './single-edit.module.css';

export type EditStartKind = 'output' | 'original' | 'library';

const STARTS: { kind: EditStartKind | 'draft'; title: string; detail: string }[] = [
  { kind: 'output', title: '改一条已有成片', detail: '载入成片的片段和入出点，换开头、剪短某段或调顺序。' },
  { kind: 'original', title: '精剪一条原片', detail: '载入一条原片的已确认片段，删减、修剪成短版本。' },
  { kind: 'library', title: '从片段库挑着拼', detail: '从同一产品的已确认片段里逐段挑选。' },
  { kind: 'draft', title: 'AI 先起草', detail: '描述想要的片子，AI 起草后再改。第二期提供。' },
];

/** Empty 剪辑台: the starting points (AI 起草 is shown but not available yet). */
export function EditStartChooser({ disabled, onStart }: { disabled: boolean; onStart: (kind: EditStartKind) => void }) {
  return (
    <ul className={editStyles.starts} aria-label="选择起点">
      {STARTS.map((start) => {
        const planned = start.kind === 'draft';
        return (
          <li key={start.kind}>
            <button
              type="button"
              className={editStyles.start}
              disabled={disabled || planned}
              onClick={() => (planned ? undefined : onStart(start.kind as EditStartKind))}
            >
              <span className={editStyles.startTitle}>
                {start.title}
                {planned ? <span className={editStyles.planned}>第二期</span> : null}
              </span>
              <span className={editStyles.startDetail}>{start.detail}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface EditTimelineProps {
  preset: StudioSegmentPreset;
  clips: readonly EditClip[];
  segments: ReadonlyMap<string, EditSegment>;
  selectedKey: string | null;
  highlightIds: ReadonlySet<string>;
  disabled: boolean;
  onSelect: (key: string) => void;
  onAdd: () => void;
}

/** The clips in playback order; a click selects one for trimming and other edits. */
export function EditTimeline({ preset, clips, segments, selectedKey, highlightIds, disabled, onSelect, onAdd }: EditTimelineProps) {
  return (
    <ol className={editStyles.timeline} aria-label="剪辑台片段">
      {clips.map((clip, index) => {
        const segment = segments.get(clip.segmentId);
        const unavailable = !segment || highlightIds.has(clip.segmentId);
        const name = segment ? labelName(preset, segment.labelKey) : '片段不可用';
        const classes = [editStyles.clip];
        if (clip.key === selectedKey) classes.push(editStyles.clipSelected);
        if (unavailable) classes.push(editStyles.clipUnavailable);
        return (
          <li key={clip.key}>
            <button
              type="button"
              className={classes.join(' ')}
              aria-pressed={clip.key === selectedKey}
              aria-label={`第 ${index + 1} 段：${name} ${formatSegmentDuration(clip.startMs, clip.endMs)}${segment && isClipTrimmed(clip, segment) ? '（已修剪）' : ''}${unavailable ? '（不可用）' : ''}`}
              onClick={() => onSelect(clip.key)}
            >
              <span className={editStyles.clipCover}>
                {segment?.coverUrl ? <img src={segment.coverUrl} alt="" loading="lazy" /> : unavailable ? <WarningFilled aria-hidden /> : <FileImageOutlined aria-hidden />}
                <span className={editStyles.clipIndex}>{index + 1}</span>
                <span className={editStyles.clipDuration}>{((clip.endMs - clip.startMs) / 1000).toFixed(1)}s</span>
                {segment && isClipTrimmed(clip, segment) ? <span className={editStyles.clipTrimmed}>已修剪</span> : null}
              </span>
              <span className={editStyles.clipName}>{name}</span>
              <span className={editStyles.clipMeta}>
                {segment ? shortAssetTitle(segment.assetTitle) : '请删除或替换'}
              </span>
            </button>
          </li>
        );
      })}
      <li>
        <button type="button" className={editStyles.addClip} onClick={onAdd} disabled={disabled} aria-label="从片段库添加片段">
          <PlusOutlined aria-hidden />
          <span>添加片段</span>
        </button>
      </li>
    </ol>
  );
}

interface ClipEditorProps {
  preset: StudioSegmentPreset;
  clip: EditClip;
  index: number;
  count: number;
  segment: EditSegment | undefined;
  disabled: boolean;
  onChange: (clip: EditClip) => void;
  onMove: (delta: -1 | 1) => void;
  onReplace: () => void;
  onRemove: () => void;
}

/** Trim handles bounded by the segment, plus preview, move, replace and delete for the selected clip. */
export function ClipEditor({ preset, clip, index, count, segment, disabled, onChange, onMove, onReplace, onRemove }: ClipEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const actions = (
    <div className={editStyles.editorActions}>
      {segment ? (
        <Button icon={<PlayCircleOutlined />} onClick={() => setPreviewing(true)}>
          预览本段
        </Button>
      ) : null}
      <Button icon={<ArrowLeftOutlined />} disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label="前移一位">
        前移
      </Button>
      <Button icon={<ArrowRightOutlined />} disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label="后移一位">
        后移
      </Button>
      <Button icon={<SwapOutlined />} disabled={disabled} onClick={onReplace}>
        替换
      </Button>
      <Button icon={<DeleteOutlined />} danger disabled={disabled} onClick={onRemove}>
        删除
      </Button>
    </div>
  );

  if (!segment) {
    return (
      <section className={editStyles.editor} aria-label={`第 ${index + 1} 段`}>
        <Alert type="warning" showIcon title={`第 ${index + 1} 段已不可用`} description="片段可能已取消确认、原片已更新，或不在当前分类预设里。请替换或删除。" />
        {actions}
      </section>
    );
  }

  const trimmed = isClipTrimmed(clip, segment);
  const title = `${segment.assetTitle} ${formatSegmentTime(clip.startMs)}–${formatSegmentTime(clip.endMs)}`;
  return (
    <section className={editStyles.editor} aria-label={`第 ${index + 1} 段`}>
      <div className={editStyles.editorHead}>
        <strong>
          第 {index + 1} 段 · {labelName(preset, segment.labelKey)}
        </strong>
        <span className={editStyles.editorSource} title={segment.assetTitle}>
          {shortAssetTitle(segment.assetTitle)}
        </span>
      </div>
      <div className={editStyles.trim}>
        <Slider
          range
          min={segment.startMs}
          max={segment.endMs}
          step={EDIT_TRIM_STEP_MS}
          value={[clip.startMs, clip.endMs]}
          disabled={disabled}
          tooltip={{ formatter: (value) => formatSegmentTime(value ?? 0) }}
          ariaLabelForHandle={['入点', '出点']}
          onChange={(value) => onChange(trimClip(clip, segment, value as [number, number]))}
        />
        <p className={editStyles.trimText}>
          入点 {formatSegmentTime(clip.startMs)} · 出点 {formatSegmentTime(clip.endMs)} · 本段 {formatSegmentDuration(clip.startMs, clip.endMs)}
          <span className={editStyles.trimBounds}>
            （片段 {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}，只能在片段内修剪）
          </span>
          {trimmed ? (
            <Button
              type="link"
              size="small"
              icon={<UndoOutlined />}
              disabled={disabled}
              onClick={() => onChange({ ...clip, startMs: segment.startMs, endMs: segment.endMs })}
            >
              还原整段
            </Button>
          ) : null}
        </p>
      </div>
      {actions}
      <Modal open={previewing} title={`预览第 ${index + 1} 段`} footer={null} width={420} destroyOnHidden onCancel={() => setPreviewing(false)}>
        {previewing ? (
          <SegmentRangePlayer
            source={{ assetId: segment.assetId, startMs: clip.startMs, endMs: clip.endMs, coverUrl: segment.coverUrl, label: title }}
          />
        ) : null}
      </Modal>
    </section>
  );
}
