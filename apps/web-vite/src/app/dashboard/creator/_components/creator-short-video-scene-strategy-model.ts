import type { DateRange } from './creator-date-range';
import {
  hasShortVideoOrderSignal,
  isShortVideoMetricEntityNewInRange,
  resolveShortVideoAdCost,
  resolveShortVideoCartRevenue,
  resolveShortVideoGsv,
  resolveShortVideoMetricEntityKey,
  resolveShortVideoOrderCount,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
} from './creator-short-video-metrics';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';

export type SceneStrategyLevel = 'scene' | 'group' | 'subtype';

export interface SceneStrategyMetrics {
  totalVideoCount: number;
  newVideoCount: number;
  orderedVideoCount: number;
  orderRate: number | null;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  qianchuanRoi: number | null;
  cartGmv: number;
  cartGsv: number;
}

export interface SceneStrategyTreeRow {
  key: string;
  label: string;
  pathLabels: string[];
  displayPath: string;
  level: SceneStrategyLevel;
  levelLabel: string;
  isFallback: boolean;
  metrics: SceneStrategyMetrics;
  children?: SceneStrategyTreeRow[];
}

interface MutableSceneStrategyNode {
  key: string;
  label: string;
  level: SceneStrategyLevel;
  levelLabel: string;
  isFallback: boolean;
  childOrder: string[];
  children: Map<string, MutableSceneStrategyNode>;
  videoIds: Set<string>;
  newVideoIds: Set<string>;
  orderedVideoIds: Set<string>;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  cartGmv: number;
  cartGsv: number;
}

interface SceneStrategyRowMetrics {
  videoKey: string;
  isNewVideo: boolean;
  hasOrderSignal: boolean;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  cartGmv: number;
  cartGsv: number;
}

const SCENE_STRATEGY_LEVEL_LABELS: Record<SceneStrategyLevel, string> = {
  scene: '场景类型',
  group: '大场景',
  subtype: '细分场景',
};

const SCENE_STRATEGY_FALLBACK_LABELS: Record<SceneStrategyLevel, string> = {
  scene: '未维护场景类型',
  group: '未维护大场景',
  subtype: '未维护细分场景',
};

export const ORDERED_VIDEO_COUNT_HELP =
  '出单数 = 有千川GMV或挂车GMV的视频数（按视频ID去重），不是订单数量；未匹配到视频ID的千川素材只计入千川GMV/GSV/消耗/订单数/ROI，不增加出单数';

export function formatSceneStrategyPath(labels: readonly string[]): string {
  const normalizedLabels = labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  if (normalizedLabels.length === 0) return '--';
  if (normalizedLabels.length === 1) return normalizedLabels[0];
  return `${normalizedLabels[0]}｜${normalizedLabels.slice(1).join(' › ')}`;
}

function createMutableSceneStrategyNode(
  key: string,
  label: string,
  level: SceneStrategyLevel,
  isFallback: boolean
): MutableSceneStrategyNode {
  return {
    key,
    label,
    level,
    levelLabel: SCENE_STRATEGY_LEVEL_LABELS[level],
    isFallback,
    childOrder: [],
    children: new Map(),
    videoIds: new Set(),
    newVideoIds: new Set(),
    orderedVideoIds: new Set(),
    qianchuanGmv: 0,
    qianchuanGsv: 0,
    qianchuanCost: 0,
    qianchuanOrderCount: 0,
    cartGmv: 0,
    cartGsv: 0,
  };
}

function resolveFirstTaxonomyValue(
  values: readonly string[] | null | undefined,
  level: SceneStrategyLevel
): { label: string; isFallback: boolean } {
  const label = values?.find((value) => value.trim().length > 0)?.trim();
  if (label) {
    return { label, isFallback: false };
  }

  return {
    label: SCENE_STRATEGY_FALLBACK_LABELS[level],
    isFallback: true,
  };
}

export function resolveSceneStrategyPath(row: CreatorShortVideoDetailRow) {
  return [
    {
      level: 'scene' as const,
      ...resolveFirstTaxonomyValue(row.asset_content_scenes, 'scene'),
    },
    {
      level: 'group' as const,
      ...resolveFirstTaxonomyValue(row.asset_content_scene_groups, 'group'),
    },
    {
      level: 'subtype' as const,
      ...resolveFirstTaxonomyValue(row.asset_content_scene_subtypes, 'subtype'),
    },
  ];
}

function encodeSceneStrategyKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function resolveSceneStrategyRowMetrics(
  row: CreatorShortVideoDetailRow,
  currentRange: DateRange
): SceneStrategyRowMetrics {
  return {
    videoKey: resolveShortVideoMetricEntityKey(row),
    isNewVideo: isShortVideoMetricEntityNewInRange(row, currentRange),
    hasOrderSignal: hasShortVideoOrderSignal(row),
    qianchuanGmv: resolveShortVideoQianchuanGmv(row),
    qianchuanGsv: resolveShortVideoQianchuanGsv(row),
    qianchuanCost: resolveShortVideoAdCost(row),
    qianchuanOrderCount: resolveShortVideoOrderCount(row),
    cartGmv: resolveShortVideoCartRevenue(row),
    cartGsv: resolveShortVideoGsv(row),
  };
}

function addRowMetricsToSceneStrategyNode(
  node: MutableSceneStrategyNode,
  metrics: SceneStrategyRowMetrics
) {
  if (metrics.videoKey) {
    node.videoIds.add(metrics.videoKey);
    if (metrics.isNewVideo) {
      node.newVideoIds.add(metrics.videoKey);
    }
    if (metrics.hasOrderSignal) {
      node.orderedVideoIds.add(metrics.videoKey);
    }
  }

  node.qianchuanGmv += metrics.qianchuanGmv;
  node.qianchuanGsv += metrics.qianchuanGsv;
  node.qianchuanCost += metrics.qianchuanCost;
  node.qianchuanOrderCount += metrics.qianchuanOrderCount;
  node.cartGmv += metrics.cartGmv;
  node.cartGsv += metrics.cartGsv;
}

function ensureSceneStrategyChildNode(
  parent: MutableSceneStrategyNode,
  pathKey: string,
  label: string,
  level: SceneStrategyLevel,
  isFallback: boolean
): MutableSceneStrategyNode {
  const existingNode = parent.children.get(pathKey);
  if (existingNode) {
    return existingNode;
  }

  const childNode = createMutableSceneStrategyNode(pathKey, label, level, isFallback);
  parent.children.set(pathKey, childNode);
  parent.childOrder.push(pathKey);
  return childNode;
}

function finalizeSceneStrategyMetrics(node: MutableSceneStrategyNode): SceneStrategyMetrics {
  const qianchuanRoi = node.qianchuanCost > 0 ? node.qianchuanGmv / node.qianchuanCost : null;
  const totalVideoCount = node.videoIds.size;
  const orderRate = totalVideoCount > 0 ? node.orderedVideoIds.size / totalVideoCount : null;

  return {
    totalVideoCount,
    newVideoCount: node.newVideoIds.size,
    orderedVideoCount: node.orderedVideoIds.size,
    orderRate,
    qianchuanGmv: node.qianchuanGmv,
    qianchuanGsv: node.qianchuanGsv,
    qianchuanCost: node.qianchuanCost,
    qianchuanOrderCount: node.qianchuanOrderCount,
    qianchuanRoi,
    cartGmv: node.cartGmv,
    cartGsv: node.cartGsv,
  };
}

function sortSceneStrategyRows(rows: SceneStrategyTreeRow[]): SceneStrategyTreeRow[] {
  return [...rows].sort((left, right) => {
    if (left.isFallback !== right.isFallback) {
      return left.isFallback ? 1 : -1;
    }

    const qianchuanGsvDiff = right.metrics.qianchuanGsv - left.metrics.qianchuanGsv;
    if (Math.abs(qianchuanGsvDiff) > Number.EPSILON) {
      return qianchuanGsvDiff;
    }

    const cartGmvDiff = right.metrics.cartGmv - left.metrics.cartGmv;
    if (Math.abs(cartGmvDiff) > Number.EPSILON) {
      return cartGmvDiff;
    }

    return left.label.localeCompare(right.label, 'zh-CN');
  });
}

function finalizeSceneStrategyTreeRows(
  node: MutableSceneStrategyNode,
  parentPathLabels: readonly string[] = []
): SceneStrategyTreeRow[] {
  const rows = node.childOrder
    .map((key) => {
      const childNode = node.children.get(key);
      if (!childNode) {
        return null;
      }

      const pathLabels = [...parentPathLabels, childNode.label];
      const childRows = finalizeSceneStrategyTreeRows(childNode, pathLabels);
      const row: SceneStrategyTreeRow = {
        key: childNode.key,
        label: childNode.label,
        pathLabels,
        displayPath: formatSceneStrategyPath(pathLabels),
        level: childNode.level,
        levelLabel: childNode.levelLabel,
        isFallback: childNode.isFallback,
        metrics: finalizeSceneStrategyMetrics(childNode),
      };

      if (childRows.length) {
        row.children = childRows;
      }

      return {
        ...row,
      };
    })
    .filter((row): row is SceneStrategyTreeRow => row !== null);

  return sortSceneStrategyRows(rows);
}

export function buildCreatorShortVideoSceneStrategyTree(
  rows: readonly CreatorShortVideoDetailRow[],
  currentRange: DateRange
): { treeRows: SceneStrategyTreeRow[]; totalMetrics: SceneStrategyMetrics } {
  const rootNode = createMutableSceneStrategyNode('root', '全部场景策略', 'scene', false);

  rows.forEach((row) => {
    const rowMetrics = resolveSceneStrategyRowMetrics(row, currentRange);

    addRowMetricsToSceneStrategyNode(rootNode, rowMetrics);

    let parentNode = rootNode;
    const pathParts: string[] = [];
    resolveSceneStrategyPath(row).forEach(({ level, label, isFallback }) => {
      pathParts.push(`${level}:${encodeSceneStrategyKeyPart(label)}`);
      const childNode = ensureSceneStrategyChildNode(parentNode, pathParts.join('|'), label, level, isFallback);
      addRowMetricsToSceneStrategyNode(childNode, rowMetrics);
      parentNode = childNode;
    });
  });

  return {
    treeRows: finalizeSceneStrategyTreeRows(rootNode),
    totalMetrics: finalizeSceneStrategyMetrics(rootNode),
  };
}

export function collectDefaultExpandedRowKeys(rows: readonly SceneStrategyTreeRow[]): string[] {
  return rows.flatMap((row) => [
    ...(row.children?.length ? [row.key] : []),
    ...collectDefaultExpandedRowKeys(row.children ?? []),
  ]);
}

export function buildTreeSignature(rows: readonly SceneStrategyTreeRow[]): string {
  return rows
    .map((row) => [
      row.key,
      row.children?.length ?? 0,
      row.children ? buildTreeSignature(row.children) : '',
    ].join(':'))
    .join('|');
}
