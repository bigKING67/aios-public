import type { PlatformTabContentProps } from './platform-tab-content-props';
import { buildPlatformKpiCardPropsList } from './platform-tab-kpi-section-adapter';
import type {
  BuildPlatformKpiCardPropsListParams,
  PlatformKpiSectionProps,
} from './platform-tab-kpi-section-contracts';

export type PlatformTabContentKind = 'tmall' | 'douyin' | 'trend';
export type PlatformTabContentPlacement = 'before-kpi' | 'after-kpi';

export type PlatformTabBodySection =
  | {
      kind: 'content';
      placement: PlatformTabContentPlacement;
      contentProps: PlatformTabContentProps;
    }
  | {
      kind: 'kpi';
      kpiSectionProps: PlatformKpiSectionProps;
    };

export interface BuildPlatformTabBodySectionsOptions {
  resolveTrendClassName: BuildPlatformKpiCardPropsListParams['resolveTrendClassName'];
}

type PlatformContentFlags = Pick<
  PlatformTabContentProps,
  'isTmallPlatform' | 'isDouyinPlatform'
>;

export function resolvePlatformTabContentKind({
  isTmallPlatform,
  isDouyinPlatform,
}: PlatformContentFlags): PlatformTabContentKind {
  if (isTmallPlatform) {
    return 'tmall';
  }

  if (isDouyinPlatform) {
    return 'douyin';
  }

  return 'trend';
}

function buildPlatformContentSection(
  contentProps: PlatformTabContentProps,
  placement: PlatformTabContentPlacement
): PlatformTabBodySection {
  return {
    kind: 'content',
    placement,
    contentProps,
  };
}

function buildKpiSection(
  {
    platformLabel,
    viewModel: { primaryMetrics },
  }: PlatformTabContentProps,
  { resolveTrendClassName }: BuildPlatformTabBodySectionsOptions
): PlatformTabBodySection {
  return {
    kind: 'kpi',
    kpiSectionProps: {
      platformLabel,
      kpiCardPropsList: buildPlatformKpiCardPropsList({
        metrics: primaryMetrics,
        resolveTrendClassName,
      }),
    },
  };
}

export function buildPlatformTabBodySections(
  contentProps: PlatformTabContentProps,
  options: BuildPlatformTabBodySectionsOptions
): PlatformTabBodySection[] {
  const contentSection = buildPlatformContentSection(
    contentProps,
    contentProps.isTmallPlatform ? 'before-kpi' : 'after-kpi'
  );
  const kpiSection = buildKpiSection(contentProps, options);

  return contentProps.isTmallPlatform
    ? [contentSection, kpiSection]
    : [kpiSection, contentSection];
}
