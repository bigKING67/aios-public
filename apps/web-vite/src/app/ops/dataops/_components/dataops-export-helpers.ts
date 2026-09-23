import { escapeCsvCell } from './dataops-hub-formatters';

export type DataOpsCsvCell = string | number | boolean;

export interface DataOpsCsvExportResult {
  mode: 'download' | 'clipboard';
  fileName: string;
  rowCount: number;
}

export interface DataOpsCsvExportWithFeedbackOptions {
  headers: string[];
  rows: DataOpsCsvCell[][];
  fileName: string;
  downloadSuccessText: string;
  clipboardSuccessText: string;
  success: (content: string) => void;
  error: (content: string) => void;
  getErrorMessage: (error: unknown) => string;
}

export function buildCsvText(headers: string[], rows: DataOpsCsvCell[][]): string {
  return ['\uFEFF' + headers.join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\n');
}

export function formatDataOpsExportTimestamp(date: Date = new Date()): string {
  return date
    .toISOString()
    .replace(/[:T]/g, '-')
    .replace(/\..+$/, '');
}

export function buildDataOpsCsvFileName(prefix: string, timestamp = formatDataOpsExportTimestamp()): string {
  return `${prefix}-${timestamp}.csv`;
}

export async function copyTextToClipboardText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持剪贴板复制');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyNormalizedTextToClipboard(options: {
  text: string;
  copy: (text: string, label: string) => Promise<void>;
  label: string;
  onEmpty: () => void;
}): Promise<void> {
  const normalizedText = options.text.trim();
  if (!normalizedText) {
    options.onEmpty();
    return;
  }

  await options.copy(normalizedText, options.label);
}

export async function copyDataOpsLinesToClipboard(options: {
  lines: readonly string[];
  copy: (text: string, label: string) => Promise<void>;
  label: string;
  onEmpty: () => void;
}): Promise<void> {
  if (!options.lines.length) {
    options.onEmpty();
    return;
  }

  await options.copy(options.lines.join('\n'), options.label);
}

function downloadTextFile(content: string, fileName: string, mimeType: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try {
    link.click();
    return true;
  } finally {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

export async function exportCsvWithBrowserFallback(options: {
  headers: string[];
  rows: DataOpsCsvCell[][];
  fileName: string;
}): Promise<DataOpsCsvExportResult> {
  const csvText = buildCsvText(options.headers, options.rows);
  const downloaded = downloadTextFile(csvText, options.fileName, 'text/csv;charset=utf-8;');
  if (downloaded) {
    return {
      mode: 'download',
      fileName: options.fileName,
      rowCount: options.rows.length,
    };
  }

  await copyTextToClipboardText(csvText);
  return {
    mode: 'clipboard',
    fileName: options.fileName,
    rowCount: options.rows.length,
  };
}

export async function exportDataOpsCsvWithFeedback(
  options: DataOpsCsvExportWithFeedbackOptions
): Promise<void> {
  try {
    const result = await exportCsvWithBrowserFallback({
      headers: options.headers,
      rows: options.rows,
      fileName: options.fileName,
    });
    if (result.mode === 'download') {
      options.success(options.downloadSuccessText);
      return;
    }

    options.success(options.clipboardSuccessText);
  } catch (caughtError) {
    options.error(`导出失败：${options.getErrorMessage(caughtError)}`);
  }
}
