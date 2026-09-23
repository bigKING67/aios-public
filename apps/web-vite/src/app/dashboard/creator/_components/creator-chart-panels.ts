import type { CreatorChartLayoutPanel } from './creator-chart-layout';

type ChartOption = CreatorChartLayoutPanel['option'];
type ChartClickHandler = CreatorChartLayoutPanel['onChartClick'];

export interface BuildCreatorDistributionChartPanelsParams {
  anchorLevelOption: ChartOption;
  cooperationPlatformOption: ChartOption;
  loading: boolean;
  onAnchorLevelChartClick: ChartClickHandler;
}

export interface BuildCreatorTrendShareChartPanelsParams {
  trendOption: ChartOption;
  shareOption: ChartOption;
  loading: boolean;
  trendTitle?: string;
  trendSubtitle: string;
  shareSubtitle: string;
  includeSharePanel?: boolean;
}

export function buildCreatorDistributionChartPanels({
  anchorLevelOption,
  cooperationPlatformOption,
  loading,
  onAnchorLevelChartClick,
}: BuildCreatorDistributionChartPanelsParams): CreatorChartLayoutPanel[] {
  return [
    {
      title: '达人等级分布',
      subtitle: '按主播等级统计达人数量，点击等级查看对应达人列表',
      option: anchorLevelOption,
      loading,
      emptyText: '当前筛选条件下暂无达人等级分布数据',
      onChartClick: onAnchorLevelChartClick,
    },
    {
      title: '合作平台分布',
      subtitle: '按达人合作平台统计',
      option: cooperationPlatformOption,
      loading,
      emptyText: '当前筛选条件下暂无合作平台分布数据',
      narrow: true,
    },
  ];
}

export function buildCreatorTrendShareChartPanels({
  trendOption,
  shareOption,
  loading,
  trendTitle = '达播GMV/GSV趋势',
  trendSubtitle,
  shareSubtitle,
  includeSharePanel = true,
}: BuildCreatorTrendShareChartPanelsParams): CreatorChartLayoutPanel[] {
  const panels: CreatorChartLayoutPanel[] = [
    {
      title: trendTitle,
      subtitle: trendSubtitle,
      option: trendOption,
      loading,
      emptyText: '当前区间暂无趋势数据',
    },
  ];

  if (includeSharePanel) {
    panels.push({
      title: '平台GMV占比',
      subtitle: shareSubtitle,
      option: shareOption,
      loading,
      emptyText: '当前区间暂无平台GMV占比数据',
      narrow: true,
    });
  }

  return panels;
}
