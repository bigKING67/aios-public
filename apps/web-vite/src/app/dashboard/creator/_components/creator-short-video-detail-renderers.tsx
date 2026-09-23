import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  CreatorCooperationStatusBadge,
  type CreatorCooperationStatusRecord,
} from './creator-cooperation-status-badge';
import {
  formatCreatorCurrencyCell,
  formatCreatorTextCell,
} from './creator-formatters';
import {
  resolveShortVideoAdCost,
  resolveShortVideoGmv,
  resolveShortVideoGsv,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoRefundAmount,
} from './creator-short-video-metrics';
import {
  normalizeShortVideoArrayValues,
} from './creator-short-video-array-values';
import { buildShortVideoContentAssetUploadPath } from './creator-short-video-content-asset-upload-link';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import { renderCreatorIdText, renderCreatorNumericText } from './creator-table-renderers';
import styles from './creator-short-video-detail-renderers.module.css';

type CreatorShortVideoStatusRow = CreatorShortVideoDetailRow & CreatorCooperationStatusRecord;

interface RenderShortVideoStatusBadgeParams {
  row: CreatorShortVideoStatusRow;
  resolveStageKey: (normalizedValue: string, value?: string | null) => string;
  formatDisplay: (value?: string | null) => string;
}

const ASSET_CHIP_TONE_CLASS_NAMES = [
  styles.assetChipToneTrafficSummary,
  styles.assetChipToneTrafficLevel2,
  styles.assetChipToneTrafficLevel3,
  styles.assetChipToneTopsisStable,
  styles.assetChipToneTopsisOpportunity,
  styles.assetChipToneTopsisLongTail,
] as const;

function mergeAssetChipClassNames(...classNames: string[]): string {
  return classNames.filter(Boolean).join(' ');
}

export function hashStringToToneIndex(
  value: string,
  toneCount = ASSET_CHIP_TONE_CLASS_NAMES.length
): number {
  if (toneCount <= 0) {
    return 0;
  }

  let hash = 2166136261;
  for (const character of value.trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % toneCount;
}

export function resolveAssetChipToneClassName(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  return ASSET_CHIP_TONE_CLASS_NAMES[hashStringToToneIndex(normalizedValue)] ?? '';
}

export function resolveAssetChipClassName(value: string): string {
  return mergeAssetChipClassNames(styles.assetChip, resolveAssetChipToneClassName(value));
}

export function renderShortVideoStatusBadge({
  row,
  resolveStageKey,
  formatDisplay,
}: RenderShortVideoStatusBadgeParams) {
  return (
    <CreatorCooperationStatusBadge
      record={row}
      resolveStageKey={resolveStageKey}
      formatDisplay={formatDisplay}
    />
  );
}

export function renderShortVideoArrayCell(value: unknown): string {
  const items = normalizeShortVideoArrayValues(value);
  if (!items.length) {
    return '--';
  }

  return items.join(' / ');
}

function uniqueShortVideoMaterialIds(value: unknown): string[] {
  return Array.from(new Set(normalizeShortVideoArrayValues(value)));
}

export function buildShortVideoMaterialIdConflictNotice(materialIds: string[]): string | null {
  const uniqueIds = Array.from(new Set(materialIds.map((item) => item.trim()).filter(Boolean)));
  if (uniqueIds.length <= 1) {
    return null;
  }

  const visibleIds = uniqueIds.slice(0, 3).join('、');
  const suffix = uniqueIds.length > 3 ? ` 等 ${uniqueIds.length} 个` : '';
  return `短视频明细命中多个千川素材 ID：${visibleIds}${suffix}。系统不会自动预填，请业务核对后手动填写。`;
}

export function renderShortVideoQianchuanMaterialIdsCell(value: unknown) {
  const materialIds = uniqueShortVideoMaterialIds(value);
  if (!materialIds.length) {
    return '--';
  }

  const displayValue = materialIds.join(' / ');
  const conflictNotice = buildShortVideoMaterialIdConflictNotice(materialIds);
  if (!conflictNotice) {
    return displayValue;
  }

  return (
    <span className={styles.materialIdWarningCell} title={conflictNotice}>
      <span className={styles.materialIdText}>{displayValue}</span>
      <span className={styles.materialIdConflictBadge} aria-label="多个千川素材ID需人工核对">
        !
      </span>
    </span>
  );
}

export function renderShortVideoChipListCell(value: unknown, maxVisible = 2) {
  const items = normalizeShortVideoArrayValues(value);
  if (!items.length) {
    return '--';
  }

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = Math.max(items.length - visibleItems.length, 0);
  const title = items.join(' / ');

  return (
    <span className={styles.assetChipList} title={title}>
      {visibleItems.map((item, index) => (
        <span className={resolveAssetChipClassName(item)} key={`${item}:${index}`}>
          {item}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className={[styles.assetChip, styles.assetChipMore].join(' ')}>
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}

export function renderShortVideoDateCell(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '--';
  }

  return normalized.replace('T', ' ').slice(0, 10);
}

export function renderShortVideoTitle(value: string | null | undefined, row: CreatorShortVideoDetailRow) {
  const title = value || row.video_id || '--';
  if (!row.play_url) {
    return formatCreatorTextCell(title);
  }

  return (
    <a href={row.play_url} target="_blank" rel="noreferrer">
      {title}
    </a>
  );
}

export function renderShortVideoInfluencerName(value: string | null | undefined, row: CreatorShortVideoDetailRow) {
  const name = formatCreatorTextCell(value || row.author_nickname || row.author_name_snapshot || row.influencer_id);
  const douyinId = (row.author_douyin_id || '').trim();

  return (
    <div className={styles.stackedTextCell}>
      <span>{name}</span>
      {douyinId ? (
        <span className={styles.stackedTextMeta}>抖音号：{renderCreatorIdText(douyinId)}</span>
      ) : null}
    </div>
  );
}

function buildContentAssetDetailPath(assetId: string): string {
  return `${ROUTE_PATHS.marketingContentAssets}/${encodeURIComponent(assetId)}`;
}

export function renderShortVideoContentAssetLinks(value: unknown, row?: CreatorShortVideoDetailRow) {
  const assetIds = normalizeShortVideoArrayValues(value);
  if (!assetIds.length) {
    return (
      <span className={[styles.assetChip, styles.assetChipMuted].join(' ')}>
        <Link
          className={styles.assetChipLink}
          to={buildShortVideoContentAssetUploadPath(row)}
          target="_blank"
          rel="noopener noreferrer"
          title="新标签页打开素材库上传素材，并带入当前行已有的视频 ID / 千川素材 ID"
        >
          未绑定，点击上传素材
        </Link>
      </span>
    );
  }

  const visibleAssetIds = assetIds.slice(0, 2);
  const hiddenCount = Math.max(assetIds.length - visibleAssetIds.length, 0);

  return (
    <span className={styles.assetChipList} title={assetIds.join(' / ')}>
      {visibleAssetIds.map((assetId, index) => (
        <span className={resolveAssetChipClassName(assetId)} key={`${assetId}:${index}`}>
          <Link
            className={styles.assetChipLink}
            to={buildContentAssetDetailPath(assetId)}
            target="_blank"
            rel="noopener noreferrer"
            title={`新标签页打开素材库视频 ${assetId}`}
          >
            {assetIds.length === 1 ? '查看视频' : `素材${index + 1}`}
          </Link>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className={[styles.assetChip, styles.assetChipMore].join(' ')}>
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}

export function renderShortVideoNumericCell(value: string, title?: string) {
  if (!title) {
    return renderCreatorNumericText(value);
  }

  return <span title={title}>{renderCreatorNumericText(value)}</span>;
}

export function renderShortVideoGsvCell(row: CreatorShortVideoDetailRow) {
  return (
    <span
      title={buildShortVideoGsvFormulaTitle(row)}
    >
      {renderCreatorNumericText(
        formatCreatorCurrencyCell(resolveShortVideoGsv(row))
      )}
    </span>
  );
}

function formatShortVideoCurrencyFormulaValue(value: number): string {
  return formatCreatorCurrencyCell(value);
}

function readShortVideoNumber(value: CreatorShortVideoDetailRow[keyof CreatorShortVideoDetailRow]): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildShortVideoQianchuanAttributionHelp(row: CreatorShortVideoDetailRow): string | null {
  const rank = readShortVideoNumber(row.qianchuan_attribution_rank);
  if (row.qianchuan_metric_attributed || rank == null || rank <= 1) {
    return null;
  }

  return '千川指标已归到同视频主行，本行不重复计入。';
}

export function buildShortVideoQianchuanMetricTitle(
  row: CreatorShortVideoDetailRow,
  label: string,
  formattedValue: string
): string {
  const title = `${label}：${formattedValue}`;
  const attributionHelp = buildShortVideoQianchuanAttributionHelp(row);
  return attributionHelp ? `${title}。${attributionHelp}` : title;
}

export function buildShortVideoGsvFormulaTitle(row: CreatorShortVideoDetailRow): string {
  const gmv = resolveShortVideoGmv(row);
  const refundAmount = resolveShortVideoRefundAmount(row);
  const gsv = resolveShortVideoGsv(row);

  return `挂车GMV ${formatShortVideoCurrencyFormulaValue(gmv)}；退款金额（退款时间）${formatShortVideoCurrencyFormulaValue(refundAmount)}；挂车GSV ${formatShortVideoCurrencyFormulaValue(gsv)}。GSV = GMV - 退款金额（退款时间）。`;
}

export function buildShortVideoTrafficRoiFormulaTitle(row: CreatorShortVideoDetailRow): string {
  const title = `千川ROI = 千川GMV / 千川消耗：${formatShortVideoCurrencyFormulaValue(resolveShortVideoQianchuanGmv(row))} / ${formatShortVideoCurrencyFormulaValue(resolveShortVideoAdCost(row))}`;
  const attributionHelp = buildShortVideoQianchuanAttributionHelp(row);
  return attributionHelp ? `${title}。${attributionHelp}` : title;
}
