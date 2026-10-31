import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioTeamOutputMetrics,
  type StudioTeamOutputQuery,
  type StudioTeamOutputResponse,
  type StudioTeamOutputTeam,
  type StudioTeamOutputVideosQuery,
  type StudioTeamOutputVideosResponse,
} from '@/lib/generated-api-contract';
import { aiStudioQueryKeys } from './ai-studio-api';

export type {
  StudioTeamOutputMetrics,
  StudioTeamOutputQuery,
  StudioTeamOutputPerson,
  StudioTeamOutputResponse,
  StudioTeamOutputTeam,
  StudioTeamOutputVideo,
} from '@/lib/generated-api-contract';

/**
 * 团队产出: 视频云管家 成片 by 剪辑 (author) or 编导 (person label), team → group → person.
 * Spend and GMV are the vendor's 巨量千川 values; GMV is 直接成交 without refunds. Other platforms' spend
 * is reported apart and never counted.
 */
export type TeamOutputDimension = 'editor' | 'director';

export const TEAM_OUTPUT_DIMENSIONS: readonly { value: TeamOutputDimension; label: string }[] = [
  { value: 'editor', label: '剪辑' },
  { value: 'director', label: '编导' },
];

export const teamOutputQueryKeys = {
  summary: (query: StudioTeamOutputQuery) => [...aiStudioQueryKeys.root, 'team-output', query] as const,
  videos: (query: StudioTeamOutputVideosQuery) => [...aiStudioQueryKeys.root, 'team-output', 'videos', query] as const,
};

export async function fetchTeamOutput(query: StudioTeamOutputQuery, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioTeamOutputResponse>(AIOS_API_PATHS.contentStudioTeamOutput, {
      params: query,
      signal: options?.signal,
    })
  ).data;
}

export async function fetchTeamOutputVideos(query: StudioTeamOutputVideosQuery, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioTeamOutputVideosResponse>(AIOS_API_PATHS.contentStudioTeamOutputVideos, {
      params: query,
      signal: options?.signal,
    })
  ).data;
}

export type TeamOutputExportKind = 'summary' | 'videos';

/** The server's file name from `Content-Disposition` (`filename*=UTF-8''…`), else a plain fallback. */
export function exportFileName(disposition: string | undefined, kind: TeamOutputExportKind): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // fall through to the plain name
    }
  }
  return kind === 'videos' ? '团队产出_成片明细.xlsx' : '团队产出_汇总.xlsx';
}

/** Downloads the XLSX of the page's filters: team rows (`summary`) or every 成片 row (`videos`). */
export async function downloadTeamOutputExport(
  query: StudioTeamOutputQuery,
  kind: TeamOutputExportKind,
  personKey?: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(AIOS_API_PATHS.contentStudioTeamOutputExport, {
    params: { ...query, kind, ...(personKey ? { personKey } : {}) },
    responseType: 'blob',
  });
  const disposition = Object.entries(response.headers).find(
    ([key]) => key.toLowerCase() === 'content-disposition',
  )?.[1];
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(disposition, kind);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The 403 reads as a permission note rather than a request failure. */
export function teamOutputErrorText(error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 403) return '当前账号没有查看团队产出的权限，请联系管理员在角色管理中开通。';
  return error instanceof Error ? error.message : '请求失败，请稍后重试。';
}

export function parseDimension(value: string | null): TeamOutputDimension {
  return value === 'director' ? 'director' : 'editor';
}

/** ¥1,234 under ten thousand, ¥22.46 万 above; exact amounts (`precise`) keep the cents. */
export function formatAmount(value: number, precise = false): string {
  if (precise) return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (Math.abs(value) >= 10_000) return `¥${(value / 10_000).toFixed(2)} 万`;
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

/** Two decimals; — when there is no spend with known GMV to divide by. */
export function formatRoi(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(2);
}

export function formatCount(value: number): string {
  return value.toLocaleString('zh-CN');
}

/** 10/28 from 2026-10-28. */
export function shortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

/** The sentinel teams (labels without an account, 成片 without anyone) list their people directly. */
export function isSentinelTeam(team: Pick<StudioTeamOutputTeam, 'kind'>): boolean {
  return team.kind === 'none' || team.kind === 'unmapped_label';
}

/** The window's data state in one tertiary line: how fresh, and which days are not complete. */
export function syncLine(sync: StudioTeamOutputResponse['sync']): { text: string; attention: boolean } {
  if (!sync.latestCompleteDay) return { text: '团队数据还没有同步', attention: true };
  const fresh = `数据完整到 ${shortDate(sync.latestCompleteDay)}`;
  const missing = sync.incompleteDays;
  if (missing.length === 0) return { text: fresh, attention: false };
  const days =
    missing.length <= 3 ? missing.map(shortDate).join('、') : `${shortDate(missing[0])} 等 ${missing.length} 天`;
  return { text: `${fresh} · ${days}未同步完整`, attention: true };
}

/** Caveats that change how a number reads; empty parts are left out. */
export function qualityParts(response: StudioTeamOutputResponse, dimension: TeamOutputDimension): string[] {
  const { quality } = response;
  const parts: string[] = [];
  if (dimension === 'director') {
    if (quality.uploadsWithoutDirector > 0)
      parts.push(`${formatCount(quality.uploadsWithoutDirector)} 条成片没有编导标签，归入「未归属」`);
    if (quality.uploadsWithSeveralDirectors > 0)
      parts.push(
        `${formatCount(quality.uploadsWithSeveralDirectors)} 条成片有多位编导，每位各计 1 条，小组和团队合计只算 1 次`,
      );
    if (quality.unmappedDirectorLabels > 0)
      parts.push(`${formatCount(quality.unmappedDirectorLabels)} 个编导标签对不上账号，归入「未关联账号」`);
  } else if (quality.uploadsWithoutAuthor > 0) {
    parts.push(`${formatCount(quality.uploadsWithoutAuthor)} 条成片没有作者，归入「未归属」`);
  }
  if (quality.spendWithoutGmv > 0)
    parts.push(`${formatAmount(quality.spendWithoutGmv)} 千川消耗云管家未返回成交数据，计入消耗、不计入 ROI`);
  if (quality.otherPlatformSpend > 0)
    parts.push(`另有巨量广告、百度等其他平台消耗 ${formatAmount(quality.otherPlatformSpend)}，不计入任何数字`);
  return parts;
}

/** The metric columns of the table, in order. */
export const TEAM_OUTPUT_COLUMNS: readonly {
  key: string;
  label: string;
  hint?: string;
  value: (metrics: StudioTeamOutputMetrics) => string;
}[] = [
  {
    key: 'uploads',
    label: '成片数',
    hint: '这段时间上传到云管家的成片条数，不分审核状态，不含已回收；编导视角下多人合作的成片每位编导各计 1 条',
    value: (m) => formatCount(m.uploads),
  },
  {
    key: 'spend',
    label: '千川消耗',
    hint: '名下所有成片在这段时间产生的巨量千川消耗，包括以前上传、这段时间仍在投放的成片；不含巨量广告、百度等其他平台',
    value: (m) => formatAmount(m.spend),
  },
  {
    key: 'gmv',
    label: '千川成交',
    hint: '上述千川消耗在巨量千川带来的直接成交金额（下单金额），不扣退款',
    value: (m) => formatAmount(m.gmv),
  },
  {
    key: 'roi',
    label: 'ROI',
    hint: 'ROI = 千川成交 ÷ 千川消耗，成交为 0 的消耗也计入；云管家未返回投放记录的成片不计入，出现时页面会单独提示',
    value: (m) => formatRoi(m.roi),
  },
  {
    key: 'newSpend',
    label: '新片消耗',
    hint: '只看这段时间上传的成片，在这段时间内的千川消耗；不含以前上传的成片',
    value: (m) => formatAmount(m.newSpend),
  },
  { key: 'newRoi', label: '新片 ROI', hint: '新片的千川成交 ÷ 新片的千川消耗', value: (m) => formatRoi(m.newRoi) },
  {
    key: 'spentVideos',
    label: '有消耗成片',
    hint: '这段时间千川消耗大于 0 的成片条数，包括以前上传的，所以可能比成片数多',
    value: (m) => formatCount(m.spentVideos),
  },
];
