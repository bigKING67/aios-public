import { toCompactNumber } from './dashboard-formatters';

interface DashboardTrendTooltipItem {
  marker?: string;
  seriesName?: string;
  axisValueLabel?: string;
  name?: string;
  dataIndex?: number;
  value?: unknown;
}

export function formatDashboardTrendTooltip(params: {
  tooltipParams: unknown;
  tooltipLabels?: readonly string[];
  dateKeys: readonly string[];
  countsByDate: Record<string, number>;
  showNoteMarkers: boolean;
  warningColor: string;
}): string {
  const items = Array.isArray(params.tooltipParams) ? params.tooltipParams : [params.tooltipParams];
  const normalized = items as DashboardTrendTooltipItem[];

  if (!normalized.length) {
    return '';
  }

  const first = normalized[0];
  const dataIndex = typeof first.dataIndex === 'number' ? first.dataIndex : -1;
  const title = (dataIndex >= 0 ? params.tooltipLabels?.[dataIndex] : undefined)
    || first.axisValueLabel
    || first.name
    || '--';
  const lines = [`<div>${title}</div>`];
  let tooltipDateKey = '';
  let tooltipNoteCount = 0;

  for (const item of normalized) {
    const numericValue = Array.isArray(item.value)
      ? Number(item.value[item.value.length - 1] || 0)
      : Number(item.value || 0);
    lines.push(`${item.marker || ''}${item.seriesName || '--'}：${toCompactNumber(numericValue)}`);
  }

  if (dataIndex >= 0) {
    const dateKey = params.dateKeys[dataIndex];
    if (dateKey) {
      const noteCount = params.countsByDate[dateKey] || 0;
      if (params.showNoteMarkers && noteCount > 0) {
        tooltipDateKey = dateKey;
        tooltipNoteCount = noteCount;
        lines.push(
          `<div style=\"margin-top:4px;color:${params.warningColor};\">日报 ${noteCount} 条（点击查看）</div>`
        );
      }
    }
  }

  const innerHtml = lines.join('<br/>');
  if (params.showNoteMarkers && tooltipDateKey && tooltipNoteCount > 0) {
    return `<div class=\"dashboard-note-tooltip-link\" data-note-date=\"${tooltipDateKey}\" style=\"cursor:pointer;\">${innerHtml}</div>`;
  }
  return innerHtml;
}
