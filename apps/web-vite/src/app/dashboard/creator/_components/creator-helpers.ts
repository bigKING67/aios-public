export function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'object') {
    const maybeError = error as { message?: unknown; code?: unknown };
    if (maybeError.code === 'ERR_CANCELED') {
      return '';
    }
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsvText(headers: readonly string[], rows: readonly string[]): string {
  return ['\uFEFF' + headers.join(','), ...rows].join('\n');
}

export function readCreatorArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

export interface ExportCreatorCsvParams<Row> {
  headers: readonly string[];
  rows: readonly Row[];
  buildCells: (row: Row) => readonly (string | number | null | undefined)[];
  fileNamePrefix: string;
  startDate: string;
  endDate: string;
  timestamp: string;
}

export interface ExportCreatorCsvResult {
  fileName: string;
  rowCount: number;
}

export function exportCreatorCsv<Row>({
  headers,
  rows,
  buildCells,
  fileNamePrefix,
  startDate,
  endDate,
  timestamp,
}: ExportCreatorCsvParams<Row>): ExportCreatorCsvResult {
  const csvRows = rows.map((row) => buildCells(row).map((cell) => escapeCsvCell(cell)).join(','));
  const csvText = buildCsvText(headers, csvRows);
  const fileName = `${fileNamePrefix}-${startDate}_to_${endDate}-${timestamp}.csv`;

  downloadCsvText(csvText, fileName);

  return {
    fileName,
    rowCount: rows.length,
  };
}

export interface CreatorCsvBaseRow {
  cooperation_status: string | null;
  cooperation_status_norm: string;
  influencer_name: string;
  influencer_id: string | null;
  anchor_desc: string | null;
  platform: string | null;
  main_platform_fans: string | null;
  sales_30d: string | null;
  sales_90d: string | null;
  cooperation_desc: string | null;
  match_status: string;
  owner_name: string | null;
  anchor_level: string | null;
  influencer_nickname: string | null;
  shop_id: string | null;
  shop_name: string | null;
}

export function buildCreatorCsvBaseCells(
  row: CreatorCsvBaseRow,
  normalizePlatform: (platform: string | null) => string
): (string | number | null | undefined)[] {
  return [
    row.cooperation_status || row.cooperation_status_norm,
    row.influencer_name,
    row.influencer_id || '',
    row.anchor_desc || '',
    normalizePlatform(row.platform),
    row.main_platform_fans || '',
    row.sales_30d || '',
    row.sales_90d || '',
    row.cooperation_desc || '',
    row.match_status,
    row.owner_name || '',
    row.anchor_level || '',
    row.influencer_nickname || '',
    row.shop_id || '',
    row.shop_name || '',
  ];
}

export function downloadCsvText(csvText: string, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function isValidDateLiteral(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
