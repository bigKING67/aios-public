import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { buildWeeklyKpiTrendItems } from './weekly-kpi-trend-data';
import type { WeeklyKpiTrendItem } from './weekly-primitives';

type OverviewKpiItem = WeeklyReportResponse['kpis'][number];

const KPI_DISPLAY_ORDER = ['gmv', 'gsv', 'refund', 'buyer', 'arpu', 'orders'];

export interface OverviewKpiCardViewModel {
  key: string;
  label: string;
  value: string;
  trends: WeeklyKpiTrendItem[];
}

export function formatOverviewTrendPercent(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  const rounded = Math.round(Math.abs(value));
  if (rounded === 0) {
    return '0%';
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${rounded}%`;
}

export function sortOverviewKpis(
  kpis: WeeklyReportResponse['kpis']
): OverviewKpiItem[] {
  const orderMap = new Map(
    KPI_DISPLAY_ORDER.map((key, index) => [key, index] as const)
  );

  return [...(Array.isArray(kpis) ? kpis : [])].sort((left, right) => {
    const leftRank =
      orderMap.get(String(left.key || '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightRank =
      orderMap.get(String(right.key || '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

export function buildOverviewKpiCardViewModels(
  kpis: WeeklyReportResponse['kpis']
): OverviewKpiCardViewModel[] {
  return sortOverviewKpis(kpis).map((kpi) => {
    const wow = Number.isFinite(kpi.wow) ? Number(kpi.wow) : undefined;
    const yoy = Number.isFinite(kpi.yoy) ? Number(kpi.yoy) : undefined;

    return {
      key: String(kpi.key || kpi.label || ''),
      label: kpi.label,
      value: kpi.display_value || '--',
      trends: buildWeeklyKpiTrendItems({
        wow,
        yoy,
        wowDisplayValue: formatOverviewTrendPercent(wow),
        yoyDisplayValue: formatOverviewTrendPercent(yoy),
      }),
    };
  });
}
