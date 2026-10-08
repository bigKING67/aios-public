import type { StudioSegmentPreset } from './ai-studio-api';
import type { StudioRemixBatch, StudioRemixBatchPreviewRequest } from './remix-api';
import { findPreset, labelName } from './segment-display';

export const MAX_REMIX_SLOTS = 30;

/** AI 剪辑 page purpose in framework-remix mode (also shown while capabilities load). */
export const REMIX_PURPOSE = '框架混剪：选产品和结构，从已确认片段批量组合出片；成片回存素材库并记录来源片段。';

/** AI 剪辑 header over one production Run's detail (成片 → 任务详情). */
export const RUN_DETAIL_PURPOSE = '查看这条成片的方案、制作进度和失败原因，可重新制作或进入工程精修。';

export type RemixStructure =
  | { mode: 'reference'; sourceAssetId: string | null }
  | { mode: 'manual'; labels: string[] };

export interface ReferenceAssetOption {
  assetId: string;
  title: string;
  labels: string[];
  /** The product most of its confirmed segments carry; picked by default with the reference. */
  productName: string | null;
  /** Opening frame of its first confirmed segment, for the reference card. */
  coverUrl: string | null;
}

/** Assets with current confirmed segments, each with its slot labels in time order. */
export function referenceAssetOptions(
  segments: readonly {
    assetId: string;
    assetTitle: string;
    labelKey: string;
    startMs: number;
    sourceCurrent: boolean;
    productName?: string | null;
    coverUrl?: string | null;
  }[],
): ReferenceAssetOption[] {
  const byAsset = new Map<
    string,
    { title: string; items: { startMs: number; labelKey: string; coverUrl: string | null }[]; products: Map<string, number> }
  >();
  for (const segment of segments) {
    if (!segment.sourceCurrent) continue;
    const entry = byAsset.get(segment.assetId) ?? { title: segment.assetTitle, items: [], products: new Map<string, number>() };
    entry.items.push({ startMs: segment.startMs, labelKey: segment.labelKey, coverUrl: segment.coverUrl ?? null });
    const product = segment.productName?.trim();
    if (product) entry.products.set(product, (entry.products.get(product) ?? 0) + 1);
    byAsset.set(segment.assetId, entry);
  }
  return [...byAsset.entries()]
    .map(([assetId, entry]) => {
      const ordered = [...entry.items].sort((a, b) => a.startMs - b.startMs);
      const products = [...entry.products.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
      return {
        assetId,
        title: entry.title,
        labels: ordered.map((item) => item.labelKey),
        coverUrl: ordered.find((item) => item.coverUrl)?.coverUrl ?? null,
        productName: products[0]?.[0] ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

/** Returns the preview request, or a hint describing what is still missing. */
export function buildRemixPreviewRequest(
  preset: StudioSegmentPreset | null,
  structure: RemixStructure,
  productName: string | null,
  count: number | null,
): StudioRemixBatchPreviewRequest | string {
  if (!preset) return '没有可用的分类预设。';
  const base = { presetKey: preset.presetKey, presetVersion: preset.version };
  let shape: Pick<StudioRemixBatchPreviewRequest, 'labels' | 'sourceAssetId'>;
  if (structure.mode === 'reference') {
    if (!structure.sourceAssetId) return '选择参考原片后显示可用组合。';
    shape = { sourceAssetId: structure.sourceAssetId };
  } else {
    if (structure.labels.length === 0) return '至少添加一位框架后显示可用组合。';
    shape = { labels: structure.labels };
  }
  if (!productName) return '选择产品后显示可用组合。';
  if (count === null || !Number.isInteger(count) || count < 1) return '填写生成数量后显示可用组合。';
  return { ...base, ...shape, productName, count };
}

/** `混剪口播 → 实拍内容 → …` in the batch's own preset. */
export function remixBatchStructureText(
  batch: Pick<StudioRemixBatch, 'presetKey' | 'presetVersion' | 'labels'>,
  presets: readonly StudioSegmentPreset[],
): string {
  const preset = findPreset(presets, batch.presetKey, batch.presetVersion);
  return batch.labels.map((key) => labelName(preset, key)).join(' → ');
}

export interface RemixCandidateGroup {
  labelKey: string;
  /** 1-based slot positions that draw from this pool. */
  ordinals: number[];
  /** The server's usable count for the pool (after access and per-label limits). */
  expectedCount: number;
  segments: RemixCandidateSegment[];
}

export interface RemixCandidateSegment {
  segmentId: string;
  assetId: string;
  assetTitle: string;
  labelKey: string;
  startMs: number;
  endMs: number;
  coverUrl: string | null;
}

/**
 * Confirmed segments a remix may draw from, one group per label in slot order.
 * Mirrors the server's filter (same preset version, exact product, current
 * source); the server additionally drops originals the viewer may not use, so
 * `expectedCount` can be lower than `segments.length`.
 */
export function groupRemixCandidates(
  slots: readonly { ordinal: number; labelKey: string; candidateCount: number }[],
  segments: readonly (RemixCandidateSegment & { presetVersion: number; productName: string | null; sourceCurrent: boolean })[],
  productName: string,
  presetVersion: number,
): RemixCandidateGroup[] {
  const groups = new Map<string, RemixCandidateGroup>();
  for (const slot of slots) {
    const group = groups.get(slot.labelKey) ?? { labelKey: slot.labelKey, ordinals: [], expectedCount: slot.candidateCount, segments: [] };
    group.ordinals.push(slot.ordinal);
    groups.set(slot.labelKey, group);
  }
  for (const segment of segments) {
    const group = groups.get(segment.labelKey);
    if (!group || !segment.sourceCurrent || segment.presetVersion !== presetVersion || segment.productName !== productName) continue;
    group.segments.push({
      segmentId: segment.segmentId,
      assetId: segment.assetId,
      assetTitle: segment.assetTitle,
      labelKey: segment.labelKey,
      startMs: segment.startMs,
      endMs: segment.endMs,
      coverUrl: segment.coverUrl,
    });
  }
  for (const group of groups.values()) {
    group.segments.sort((a, b) => a.assetTitle.localeCompare(b.assetTitle, 'zh-CN') || a.startMs - b.startMs);
  }
  return [...groups.values()];
}

/** Compact caption: drop a shared leading tag like 「【测试】」 so the original's own name shows. */
export function shortAssetTitle(title: string): string {
  return title.replace(/^【[^】]*】\s*/, '') || title;
}
