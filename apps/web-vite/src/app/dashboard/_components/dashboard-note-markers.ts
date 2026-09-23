export interface DashboardNoteMarkPoint {
  name: string;
  xAxis: number;
  yAxis: number;
  value: number;
  symbolSize: number;
}

export function getDashboardNoteMarkerSymbolSize(noteCount: number): number {
  return noteCount >= 5 ? 22 : noteCount >= 3 ? 19 : 16;
}

export function buildDashboardNoteMarkPoints(params: {
  showNoteMarkers: boolean;
  isDayMode: boolean;
  dateKeys: readonly string[];
  primarySeries: readonly number[];
  countsByDate: Record<string, number>;
}): DashboardNoteMarkPoint[] {
  if (!params.showNoteMarkers || !params.isDayMode || params.dateKeys.length === 0) {
    return [];
  }

  const markers: DashboardNoteMarkPoint[] = [];
  for (let index = 0; index < params.dateKeys.length; index += 1) {
    const dateKey = params.dateKeys[index];
    const count = params.countsByDate[dateKey] || 0;
    if (count <= 0) {
      continue;
    }

    markers.push({
      name: dateKey,
      xAxis: index,
      yAxis: Number(params.primarySeries[index] || 0),
      value: count,
      symbolSize: getDashboardNoteMarkerSymbolSize(count),
    });
  }

  return markers;
}

export function resolveDashboardNoteMarkerClickDate(params: {
  payload: unknown;
  dateKeys: readonly string[];
  countsByDate: Record<string, number>;
  dateLiteralPattern: RegExp;
}): string | null {
  const payload = params.payload as {
    componentType?: unknown;
    data?: unknown;
    dataIndex?: unknown;
    seriesDataIndex?: unknown;
  };

  if (payload.componentType === 'markPoint') {
    const markPointData = payload.data as { name?: unknown; xAxis?: unknown } | undefined;
    if (
      markPointData &&
      typeof markPointData.name === 'string' &&
      params.dateLiteralPattern.test(markPointData.name)
    ) {
      return markPointData.name;
    }

    if (markPointData && typeof markPointData.xAxis === 'number') {
      return params.dateKeys[markPointData.xAxis] || null;
    }
  }

  const fallbackIndex =
    typeof payload.seriesDataIndex === 'number'
      ? payload.seriesDataIndex
      : typeof payload.dataIndex === 'number'
        ? payload.dataIndex
        : -1;
  if (fallbackIndex < 0) {
    return null;
  }

  const dateKey = params.dateKeys[fallbackIndex];
  if (!dateKey) {
    return null;
  }

  return (params.countsByDate[dateKey] || 0) > 0 ? dateKey : null;
}
