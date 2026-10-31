import type { StudioSegmentPreset } from './ai-studio-api';
import type { StudioRemixBatch } from './remix-api';
import { remixBatchStructureText } from './remix-form';

const BEIJING_DATE = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

export interface RemixStructureGroup {
  structure: string;
  batches: StudioRemixBatch[];
}

export interface RemixDateGroup {
  dateKey: string;
  dateLabel: string;
  structures: RemixStructureGroup[];
}

function beijingDate(value: string): { key: string; label: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { key: 'unknown', label: '日期未知' };
  const parts = Object.fromEntries(BEIJING_DATE.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.year ?? '';
  const month = parts.month ?? '';
  const day = parts.day ?? '';
  return {
    key: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    label: `${year} 年 ${month} 月 ${day} 日`,
  };
}

/** Groups only the rows already returned for the current page, preserving the server's newest-first order. */
export function groupRemixBatchesForCurrentPage(
  batches: readonly StudioRemixBatch[],
  presets: readonly StudioSegmentPreset[],
): RemixDateGroup[] {
  const dates = new Map<string, RemixDateGroup>();
  for (const batch of batches) {
    const date = beijingDate(batch.createdAt);
    let dateGroup = dates.get(date.key);
    if (!dateGroup) {
      dateGroup = { dateKey: date.key, dateLabel: date.label, structures: [] };
      dates.set(date.key, dateGroup);
    }
    const structure = remixBatchStructureText(batch, presets);
    let structureGroup = dateGroup.structures.find((group) => group.structure === structure);
    if (!structureGroup) {
      structureGroup = { structure, batches: [] };
      dateGroup.structures.push(structureGroup);
    }
    structureGroup.batches.push(batch);
  }
  return [...dates.values()];
}
