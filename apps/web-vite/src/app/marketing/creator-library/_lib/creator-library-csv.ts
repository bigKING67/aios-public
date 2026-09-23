import { parseBooleanText } from './creator-library-formatters';
import { normalizeCreatorAnchorLevel } from './creator-library-levels';
import {
  isNotCooperableStatus,
  normalizeCooperationStatusValue,
  NOT_COOPERABLE_STATUS_VALUE,
} from './creator-library-options';
import { splitCreatorTagText } from './creator-library-tags';
import type { CreatorLibraryCsvRow, CreatorLibraryPayload } from './creator-library-types';
import { parseCreatorLibraryXlsxFile } from './creator-library-api';

export const CREATOR_LIBRARY_TEMPLATE_HEADERS = [
  '达人ID',
  '达人昵称',
  '平台',
  '粉丝数',
  '主播标签',
  '达人等级',
  '近90天带货GMV',
  '合作状态',
  '归属BD',
] as const;

const HEADER_ALIASES: Record<string, keyof CreatorLibraryCsvRow> = {
  平台: 'platform',
  达人昵称: 'influencerName',
  达人名称: 'influencerName',
  达人ID: 'influencerId',
  达人id: 'influencerId',
  抖音号: 'douyinHandle',
  手机号: 'phone',
  手机: 'phone',
  MCN: 'mcn',
  mcn: 'mcn',
  类目: 'category',
  粉丝数: 'mainPlatformFans',
  达人等级: 'anchorLevel',
  主播标签: 'anchorDesc',
  达人标签: 'anchorDesc',
  近30天GMV: 'sales30d',
  近90天GMV: 'sales90d',
  近90天带货GMV: 'sales90d',
  合作状态: 'cooperationStatus',
  是否可合作: 'isCooperable',
  归属BD: 'ownerName',
  归属bd: 'ownerName',
  跟进备注: 'followNote',
  合作描述: 'cooperationDesc',
};

export function parseCreatorLibraryCsv(text: string): CreatorLibraryCsvRow[] {
  const rows = parseCsv(text);
  return rowsToCreatorLibraryRows(rows);
}

export async function parseCreatorLibraryUpload(file: File): Promise<CreatorLibraryCsvRow[]> {
  const fileName = file.name.toLowerCase();
  if (
    fileName.endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return rowsToCreatorLibraryRows(await parseCreatorLibraryXlsxFile(file));
  }

  if (file.type === 'text/csv' || fileName.endsWith('.csv')) {
    return parseCreatorLibraryCsv(await file.text());
  }

  throw new Error('仅支持 XLSX 模板或 CSV 文件');
}

export function rowsToCreatorLibraryRows(rows: string[][]): CreatorLibraryCsvRow[] {
  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map(normalizeHeaderText);
  const keys = headers.map((header) => HEADER_ALIASES[header] ?? null);

  return rows.slice(1).map((cells, index) => {
    const row: CreatorLibraryCsvRow = {
      platform: '',
      influencerName: '',
      rowNumber: index + 2,
    };

    keys.forEach((key, cellIndex) => {
      if (!key) {
        return;
      }
      const rawValue = (cells[cellIndex] ?? '').trim();
      if (!rawValue) {
        return;
      }
      if (key === 'isCooperable') {
        row.isCooperable = parseBooleanText(rawValue);
        return;
      }
      row[key] = rawValue as never;
    });

    row.error = validateCsvRow(row);
    return row;
  });
}

function normalizeHeaderText(value: string): string {
  return value.trim().replace(/^\uFEFF/, '').replace(/\s+/g, '');
}

export function csvRowToPayload(row: CreatorLibraryCsvRow): CreatorLibraryPayload {
  const tags = splitCreatorTagText(row.anchorDesc);
  const isNotCooperable =
    row.isCooperable === false || isNotCooperableStatus(row.cooperationStatus);
  return {
    platform: row.platform,
    influencer_name: row.influencerName,
    influencer_id: row.influencerId,
    douyin_handle: row.douyinHandle,
    phone: row.phone,
    mcn: row.mcn,
    category: row.category,
    anchor_desc: tags.length ? tags.join('、') : row.anchorDesc,
    anchor_level: normalizeCreatorAnchorLevel(row.anchorLevel),
    main_platform_fans: row.mainPlatformFans,
    sales_30d: row.sales30d,
    sales_90d: row.sales90d,
    tags,
    cooperation_status: isNotCooperable
      ? NOT_COOPERABLE_STATUS_VALUE
      : normalizeCooperationStatusValue(row.cooperationStatus),
    cooperation_desc: row.cooperationDesc,
    owner_name: row.ownerName,
    is_cooperable: isNotCooperable ? false : (row.isCooperable ?? true),
    follow_note: row.followNote,
  };
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8'
): void {
  const blob = new Blob(['\uFEFF', content], { type: mime });
  downloadBlobFile(filename, blob);
}

export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim())) {
    rows.push(currentRow);
  }

  return rows;
}

function validateCsvRow(row: CreatorLibraryCsvRow): string | undefined {
  if (!row.platform?.trim()) {
    return '平台不能为空';
  }
  if (!row.influencerId?.trim()) {
    return '达人ID不能为空';
  }
  if (!row.influencerName?.trim()) {
    return '达人昵称不能为空';
  }
  return undefined;
}
