import { LinkOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  EMPTY_TEXT,
  formatExposureRange,
  formatIndustryMaterialBrandResolutionTooltip,
  formatInteger,
  formatRate,
  parseExposureRange,
  resolveIndustryMaterialDisplayBrand,
  REVIEW_INDUSTRY_MATERIAL_BRAND,
  UNKNOWN_INDUSTRY_MATERIAL_BRAND,
} from './industry-material-inspiration-formatters';
import type {
  IndustryMaterialMetricValue,
  IndustryMaterialRow,
} from './industry-material-inspiration-types';
import {
  resolveAssetHref,
  resolveText,
} from './industry-material-inspiration-client-helpers';
import tableCellStyles from './industry-material-table-cells.module.css';

export function NumericCell({
  value,
  formatter,
}: {
  value: IndustryMaterialMetricValue;
  formatter: 'integer' | 'rate';
}) {
  return (
    <span className={tableCellStyles.numericCell}>
      {formatter === 'integer' ? formatInteger(value) : formatRate(value)}
    </span>
  );
}

export function ExposureCell({ row }: { row: IndustryMaterialRow }) {
  return (
    <span className={tableCellStyles.exposureCell}>
      {formatExposureRange(parseExposureRange(row))}
    </span>
  );
}

export function RankCell({ value }: { value: IndustryMaterialMetricValue }) {
  return <span className={tableCellStyles.rankCell}>{formatInteger(value)}</span>;
}

export function BrandCell({ row }: { row: IndustryMaterialRow }) {
  const value = resolveIndustryMaterialDisplayBrand(row);
  const isUnknown = value === EMPTY_TEXT || value === UNKNOWN_INDUSTRY_MATERIAL_BRAND;
  const isReview = value === REVIEW_INDUSTRY_MATERIAL_BRAND;
  const tooltip = formatIndustryMaterialBrandResolutionTooltip(row);
  const pill = (
    <span
      className={[
        tableCellStyles.brandCell,
        tableCellStyles.brandPill,
        isReview
          ? tableCellStyles.brandPillReview
          : isUnknown
            ? tableCellStyles.brandPillUnknown
            : tableCellStyles.brandPillKnown,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={tooltip ? `${value}，${tooltip}` : value}
      tabIndex={tooltip ? 0 : undefined}
    >
      {value}
    </span>
  );

  return tooltip ? <Tooltip title={tooltip}>{pill}</Tooltip> : pill;
}

export function TextCell({ value }: { value: string }) {
  return (
    <span
      className={value === EMPTY_TEXT ? tableCellStyles.mutedText : tableCellStyles.textCell}
      title={value}
    >
      {value}
    </span>
  );
}

export function VideoCell({ row }: { row: IndustryMaterialRow }) {
  const title = resolveText(row.title, row.videoTitle);
  const href = resolveAssetHref(row);
  if (!href) {
    return (
      <div className={tableCellStyles.videoCell}>
        <span className={tableCellStyles.videoTitle} title={title}>
          {title}
        </span>
      </div>
    );
  }

  return (
    <div className={tableCellStyles.videoCell}>
      <a
        href={href}
        className={tableCellStyles.assetLink}
        target="_blank"
        rel="noreferrer"
        title={title}
      >
        <span className={tableCellStyles.videoTitle}>{title}</span>
        <LinkOutlined aria-hidden />
      </a>
    </div>
  );
}
