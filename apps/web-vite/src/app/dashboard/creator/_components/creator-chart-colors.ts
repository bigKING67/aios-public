import { CHART_SERIES_COLORS, DOMAIN_TAXONOMY_COLORS } from '@/lib/domain-taxonomy-colors';
import { DESIGN_COLOR_VALUES } from '@/lib/design-token-values';
import { PLATFORM_LEGEND_COLORS, getPlatformLegendColor } from '@/lib/platform-colors';

export const CREATOR_ANCHOR_LEVEL_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;
export type CreatorAnchorLevel = (typeof CREATOR_ANCHOR_LEVEL_ORDER)[number];

const CREATOR_LEVEL_COLORS = DOMAIN_TAXONOMY_COLORS.creator;
const DESIGN_COLORS = DESIGN_COLOR_VALUES;

export const CREATOR_ANCHOR_LEVEL_GRADIENT_MAP: Record<
  CreatorAnchorLevel,
  { from: string; to: string }
> = {
  S: { from: CREATOR_LEVEL_COLORS.s.from, to: CREATOR_LEVEL_COLORS.s.to },
  A: { from: CREATOR_LEVEL_COLORS.a.from, to: CREATOR_LEVEL_COLORS.a.to },
  B: { from: CREATOR_LEVEL_COLORS.b.from, to: CREATOR_LEVEL_COLORS.b.to },
  C: { from: CREATOR_LEVEL_COLORS.c.from, to: CREATOR_LEVEL_COLORS.c.to },
  D: { from: CREATOR_LEVEL_COLORS.d.from, to: CREATOR_LEVEL_COLORS.d.to },
};

export const CREATOR_ANCHOR_LEVEL_FALLBACK_COLOR = CREATOR_ANCHOR_LEVEL_GRADIENT_MAP.A.to;

export function normalizeCreatorAnchorLevel(level: string | null): CreatorAnchorLevel | null {
  if (!level) {
    return null;
  }

  const normalized = level.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes('S')) {
    return 'S';
  }
  if (normalized.includes('A')) {
    return 'A';
  }
  if (normalized.includes('B')) {
    return 'B';
  }
  if (normalized.includes('C')) {
    return 'C';
  }
  if (normalized.includes('D')) {
    return 'D';
  }

  return null;
}

export function normalizeCreatorAnchorLevelFromChartParams(
  params: unknown
): CreatorAnchorLevel | null {
  if (!params || typeof params !== 'object') {
    return null;
  }

  const name = (params as { name?: unknown }).name;
  return typeof name === 'string' ? normalizeCreatorAnchorLevel(name) : null;
}

export const CREATOR_MULTI_PLATFORM_RAINBOW_COLOR = {
  type: 'linear',
  x: 0,
  y: 0,
  x2: 1,
  y2: 1,
  colorStops: [
    { offset: 0, color: PLATFORM_LEGEND_COLORS.tmall },
    { offset: 0.24, color: PLATFORM_LEGEND_COLORS.xiaohongshu },
    { offset: 0.48, color: PLATFORM_LEGEND_COLORS.jd },
    { offset: 0.72, color: PLATFORM_LEGEND_COLORS.wechat },
    { offset: 1, color: PLATFORM_LEGEND_COLORS.douyin },
  ],
  global: false,
} as const;

export type CreatorCooperationPlatformChartColor =
  | string
  | typeof CREATOR_MULTI_PLATFORM_RAINBOW_COLOR;

export const CREATOR_CHART_TEXT_COLORS = {
  label: DESIGN_COLORS.textSecondary,
  legend: DESIGN_COLORS.textPrimary,
  tooltip: DESIGN_COLORS.textPrimary,
  strong: DESIGN_COLORS.textPrimary,
  axis: DESIGN_COLORS.textTertiary,
  meta: DESIGN_COLORS.textTertiary,
  accentValue: CHART_SERIES_COLORS.series1,
} as const;

export const CREATOR_CHART_MATERIAL_COLORS = {
  gmvArea: 'rgba(47, 110, 234, 0.12)',
  pieBorder: 'rgba(248, 250, 252, 0.96)',
  pieLabelLine: 'rgba(100, 116, 139, 0.42)',
  levelTrack: 'rgba(220, 235, 220, 0.72)',
  valueBadgeBackground: 'rgba(255, 255, 255, 0.92)',
  valueBadgeShadow: 'rgba(26, 26, 26, 0.08)',
  levelShadowDefault: 'rgba(47, 110, 234, 0.24)',
  levelShadowSelected: 'rgba(47, 110, 234, 0.42)',
} as const;

export const CREATOR_TOOLTIP_MATERIAL_COLORS = {
  tintSurface: DESIGN_COLORS.backgroundPrimary,
  fallbackShadow: 'rgba(26, 26, 26, 0.2)',
  multiPlatformDivider: '#D7DEE0',
  multiPlatformShadow: '0 14px 32px rgba(26, 26, 26, 0.14)',
  multiPlatformBackground:
    'linear-gradient(130deg, #fff1ec 0%, #fff0f2 24%, #fff4f2 48%, #eaf8ee 72%, #f5f5f5 100%)',
} as const;

export const CREATOR_TREND_CHART_COLORS = {
  gmvSeries: CHART_SERIES_COLORS.series1,
  gsvSeries: CHART_SERIES_COLORS.series2,
  gmvArea: CREATOR_CHART_MATERIAL_COLORS.gmvArea,
} as const;

export const CREATOR_CHART_STRUCTURAL_COLORS = {
  axisLine: CREATOR_TOOLTIP_MATERIAL_COLORS.multiPlatformDivider,
  gridLine: DESIGN_COLORS.border,
  pieBorder: CREATOR_CHART_MATERIAL_COLORS.pieBorder,
  pieLabelLine: CREATOR_CHART_MATERIAL_COLORS.pieLabelLine,
  levelTrack: CREATOR_CHART_MATERIAL_COLORS.levelTrack,
  valueBadgeBackground: CREATOR_CHART_MATERIAL_COLORS.valueBadgeBackground,
  valueBadgeShadow: CREATOR_CHART_MATERIAL_COLORS.valueBadgeShadow,
  levelShadowDefault: CREATOR_CHART_MATERIAL_COLORS.levelShadowDefault,
  levelShadowSelected: CREATOR_CHART_MATERIAL_COLORS.levelShadowSelected,
} as const;

export interface CreatorTooltipThemeToken {
  background: string;
  borderColor: string;
  shadow: string;
  labelColor: string;
  titleColor: string;
  valueColor: string;
  accentValueColor: string;
  dividerColor: string;
}

const CREATOR_TOOLTIP_TINT_TARGETS = {
  surface: CREATOR_TOOLTIP_MATERIAL_COLORS.tintSurface,
  ink: CREATOR_CHART_TEXT_COLORS.strong,
  fallbackShadow: CREATOR_TOOLTIP_MATERIAL_COLORS.fallbackShadow,
} as const;

export const CREATOR_MULTI_PLATFORM_TOOLTIP_THEME: CreatorTooltipThemeToken = {
  background: CREATOR_TOOLTIP_MATERIAL_COLORS.multiPlatformBackground,
  borderColor: CREATOR_TOOLTIP_MATERIAL_COLORS.multiPlatformDivider,
  shadow: CREATOR_TOOLTIP_MATERIAL_COLORS.multiPlatformShadow,
  labelColor: CREATOR_CHART_TEXT_COLORS.label,
  titleColor: CREATOR_CHART_TEXT_COLORS.strong,
  valueColor: CREATOR_CHART_TEXT_COLORS.strong,
  accentValueColor: CREATOR_CHART_TEXT_COLORS.accentValue,
  dividerColor: CREATOR_TOOLTIP_MATERIAL_COLORS.multiPlatformDivider,
};

function parseHexColor(hexColor: string): { r: number; g: number; b: number } | null {
  const normalized = hexColor.trim().replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((token) => token + token)
          .join('')
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function toHexColor(rgb: { r: number; g: number; b: number }): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const hex = [clamp(rgb.r), clamp(rgb.g), clamp(rgb.b)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function toRgba(
  hexColor: string,
  alpha: number,
  fallback = `rgba(47, 110, 234, ${alpha})`
): string {
  const rgb = parseHexColor(hexColor);
  if (!rgb) {
    return fallback;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixHexColors(baseColor: string, targetColor: string, targetWeight: number): string {
  const base = parseHexColor(baseColor);
  const target = parseHexColor(targetColor);
  if (!base || !target) {
    return baseColor;
  }
  const weight = Math.max(0, Math.min(1, targetWeight));
  return toHexColor({
    r: base.r * (1 - weight) + target.r * weight,
    g: base.g * (1 - weight) + target.g * weight,
    b: base.b * (1 - weight) + target.b * weight,
  });
}

export function buildCreatorTintedTooltipTheme(accentColor: string): CreatorTooltipThemeToken {
  const bgTop = mixHexColors(accentColor, CREATOR_TOOLTIP_TINT_TARGETS.surface, 0.88);
  const bgBottom = mixHexColors(accentColor, CREATOR_TOOLTIP_TINT_TARGETS.surface, 0.76);
  const borderColor = mixHexColors(accentColor, CREATOR_TOOLTIP_TINT_TARGETS.surface, 0.56);
  const dividerColor = mixHexColors(accentColor, CREATOR_TOOLTIP_TINT_TARGETS.surface, 0.5);
  const accentValueColor = mixHexColors(accentColor, CREATOR_TOOLTIP_TINT_TARGETS.ink, 0.08);
  return {
    background: `linear-gradient(148deg, ${bgTop} 0%, ${bgBottom} 100%)`,
    borderColor,
    shadow: `0 14px 32px ${toRgba(
      accentColor,
      0.24,
      CREATOR_TOOLTIP_TINT_TARGETS.fallbackShadow
    )}`,
    labelColor: CREATOR_CHART_TEXT_COLORS.label,
    titleColor: CREATOR_CHART_TEXT_COLORS.strong,
    valueColor: CREATOR_CHART_TEXT_COLORS.strong,
    accentValueColor,
    dividerColor,
  };
}

export function resolveCreatorCooperationPlatformSolidColor(platform: string): string {
  return getPlatformLegendColor(platform);
}

export function resolveCreatorCooperationPlatformColor(
  platform: string
): CreatorCooperationPlatformChartColor {
  if (platform === '多平台') {
    return CREATOR_MULTI_PLATFORM_RAINBOW_COLOR;
  }
  return resolveCreatorCooperationPlatformSolidColor(platform);
}

export function resolveCreatorCooperationPlatformTooltipTheme(
  platform: string
): CreatorTooltipThemeToken {
  if (platform === '多平台') {
    return CREATOR_MULTI_PLATFORM_TOOLTIP_THEME;
  }
  return buildCreatorTintedTooltipTheme(resolveCreatorCooperationPlatformSolidColor(platform));
}

export function resolveCreatorAnchorLevelColor(
  level: CreatorAnchorLevel | null | undefined
): string {
  return level ? CREATOR_ANCHOR_LEVEL_GRADIENT_MAP[level].to : CREATOR_ANCHOR_LEVEL_FALLBACK_COLOR;
}

export function resolveCreatorAnchorLevelTooltipTheme(
  level: CreatorAnchorLevel | null | undefined
): CreatorTooltipThemeToken {
  return buildCreatorTintedTooltipTheme(resolveCreatorAnchorLevelColor(level));
}

export function resolveCreatorAnchorLevelTooltipThemeFromLabel(
  levelLabel: string
): CreatorTooltipThemeToken {
  return resolveCreatorAnchorLevelTooltipTheme(normalizeCreatorAnchorLevel(levelLabel));
}
