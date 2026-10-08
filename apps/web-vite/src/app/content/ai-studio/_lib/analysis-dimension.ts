import type { StudioSegmentPreset } from './ai-studio-api';

export type AnalysisDimension = 'framework' | 'picture' | 'custom';

interface DimensionCopy {
  /** Tab label, e.g. 框架分析. */
  title: string;
  /** Noun for the preset labels, e.g. 框架 / 画面类型. */
  labelNoun: string;
  description: string;
}

const DIMENSION_COPY: Record<AnalysisDimension, DimensionCopy> = {
  framework: {
    title: '框架分析',
    labelNoun: '框架',
    description: '按内容结构切段（混剪口播、实拍内容、街采、机制、KOC），片段较长，用于框架混剪：同框架片段连同原声替换重组。',
  },
  picture: {
    title: '画面分析',
    labelNoun: '画面类型',
    description: '按镜头切段（痛点、上妆、美展、街采、产展），片段较短，用于画面混剪：同画面类型的镜头互相替换。',
  },
  custom: {
    title: '自定义分析',
    labelNoun: '类别',
    description: '按自定义分类预设切段。',
  },
};

const DIMENSION_ORDER: readonly AnalysisDimension[] = ['framework', 'picture', 'custom'];

export function dimensionCopy(dimension: string): DimensionCopy {
  return DIMENSION_COPY[(dimension in DIMENSION_COPY ? dimension : 'custom') as AnalysisDimension];
}

/** Active presets grouped by dimension, dimensions in product order, versions newest first. */
export function groupPresetsByDimension(
  presets: readonly StudioSegmentPreset[]
): { dimension: AnalysisDimension; presets: StudioSegmentPreset[] }[] {
  return DIMENSION_ORDER.map((dimension) => ({
    dimension,
    presets: presets
      .filter((preset) => preset.status === 'active' && (preset.dimension in DIMENSION_COPY ? preset.dimension : 'custom') === dimension)
      .sort((a, b) => b.version - a.version),
  })).filter((group) => group.presets.length > 0);
}
