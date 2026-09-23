'use client';

import { useCallback, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import dayjs from 'dayjs';
import type { DateRange } from './creator-date-range';
import { exportCreatorCsv, normalizeErrorMessage } from './creator-helpers';

export interface CreatorCsvExportConfig<Row> {
  headers: readonly string[];
  fileNamePrefix: string;
  buildCells: (row: Row) => readonly (string | number | null | undefined)[];
}

export interface UseCreatorCsvExportParams<Row> {
  rows: readonly Row[];
  isAuthenticated: boolean;
  currentRange: DateRange;
  messageApi: MessageInstance;
  getConfig: () => CreatorCsvExportConfig<Row>;
  unauthenticatedMessage?: string;
  emptyMessage?: string;
  successMessage?: (rowCount: number, fileName: string) => string;
}

export interface UseCreatorCsvExportResult {
  isExporting: boolean;
  handleExportCsv: () => Promise<void>;
}

const DEFAULT_CSV_EXPORT_UNAUTHENTICATED_MESSAGE = '未登录状态仅支持浏览，登录后可导出明细。';
const DEFAULT_CSV_EXPORT_EMPTY_MESSAGE = '当前筛选条件下没有可导出的明细数据。';

function buildDefaultCsvExportSuccessMessage(rowCount: number, fileName: string): string {
  return `已导出 ${rowCount} 条明细到 ${fileName}`;
}

export function useCreatorCsvExport<Row>({
  rows,
  isAuthenticated,
  currentRange,
  messageApi,
  getConfig,
  unauthenticatedMessage = DEFAULT_CSV_EXPORT_UNAUTHENTICATED_MESSAGE,
  emptyMessage = DEFAULT_CSV_EXPORT_EMPTY_MESSAGE,
  successMessage = buildDefaultCsvExportSuccessMessage,
}: UseCreatorCsvExportParams<Row>): UseCreatorCsvExportResult {
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExportCsv = useCallback(async () => {
    if (isExporting) {
      return;
    }

    if (!isAuthenticated) {
      messageApi.info(unauthenticatedMessage);
      return;
    }

    if (!rows.length) {
      messageApi.info(emptyMessage);
      return;
    }

    setIsExporting(true);
    try {
      const { headers, fileNamePrefix, buildCells } = getConfig();
      const startDate = currentRange.start.format('YYYY-MM-DD');
      const endDate = currentRange.end.format('YYYY-MM-DD');
      const { fileName, rowCount } = exportCreatorCsv({
        headers,
        rows,
        fileNamePrefix,
        startDate,
        endDate,
        timestamp: dayjs().format('YYYYMMDD-HHmmss'),
        buildCells,
      });

      messageApi.success(successMessage(rowCount, fileName));
    } catch (error) {
      const messageText = normalizeErrorMessage(error, '导出失败，请稍后重试。');
      if (messageText) {
        messageApi.error(messageText);
      }
    } finally {
      setIsExporting(false);
    }
  }, [
    currentRange.end,
    currentRange.start,
    emptyMessage,
    getConfig,
    isAuthenticated,
    isExporting,
    messageApi,
    rows,
    successMessage,
    unauthenticatedMessage,
  ]);

  return {
    isExporting,
    handleExportCsv,
  };
}
