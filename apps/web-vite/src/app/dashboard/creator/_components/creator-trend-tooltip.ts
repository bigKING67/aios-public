import { escapeTooltipHtml, formatTooltipCurrency } from './creator-formatters';

export interface CreatorTrendTooltipContributor {
  platform: string;
  influencerName: string;
  liveGmv: number;
  refundAmount?: number;
  liveGsv: number;
}

export type CreatorTrendTooltipStyles = Readonly<Record<string, string>>;

export interface BuildCreatorTrendTooltipHtmlParams {
  dateLabel: string;
  gmvValue: number;
  gsvValue: number;
  gsvLabel?: string;
  contributors: readonly CreatorTrendTooltipContributor[];
  contributorCount: number;
  countLabel: string;
  styles: CreatorTrendTooltipStyles;
}

function isCurrencyZero(value: number): boolean {
  return Math.abs(value) < 0.005;
}

function toCompactMetricLabel(label: string): string {
  if (label.includes('GSV')) {
    return 'GSV';
  }
  return label;
}

function buildContributorMetricParts(item: CreatorTrendTooltipContributor, gsvLabel: string): string[] {
  const refundAmount = item.refundAmount ?? 0;
  const hasRefund = !isCurrencyZero(refundAmount);
  const hasGmv = !isCurrencyZero(item.liveGmv);
  const compactGsvLabel = toCompactMetricLabel(gsvLabel);
  const metricParts = [`GMV ${formatTooltipCurrency(item.liveGmv)}`];

  if (!hasGmv) {
    if (hasRefund) {
      metricParts.push(`退款 ${formatTooltipCurrency(refundAmount)}`);
    } else if (!isCurrencyZero(item.liveGsv)) {
      metricParts.push(`${compactGsvLabel} ${formatTooltipCurrency(item.liveGsv)}`);
    }
    return metricParts;
  }

  metricParts.push(`${compactGsvLabel} ${formatTooltipCurrency(item.liveGsv)}`);
  return metricParts;
}

export function buildCreatorTrendTooltipHtml({
  dateLabel,
  gmvValue,
  gsvValue,
  gsvLabel = 'GSV',
  contributors,
  contributorCount,
  countLabel,
  styles,
}: BuildCreatorTrendTooltipHtmlParams): string {
  const contributorMap = new Map<string, CreatorTrendTooltipContributor>();
  for (const contributor of contributors) {
    if (contributor.liveGmv === 0 && (contributor.refundAmount ?? 0) === 0 && contributor.liveGsv === 0) {
      continue;
    }
    const mapKey = `${contributor.platform}__${contributor.influencerName}`;
    const currentValue = contributorMap.get(mapKey);
    if (currentValue) {
      currentValue.liveGmv += contributor.liveGmv;
      if (currentValue.refundAmount !== undefined || contributor.refundAmount !== undefined) {
        currentValue.refundAmount = (currentValue.refundAmount ?? 0) + (contributor.refundAmount ?? 0);
      }
      currentValue.liveGsv += contributor.liveGsv;
      continue;
    }
    contributorMap.set(mapKey, {
      platform: contributor.platform,
      influencerName: contributor.influencerName,
      liveGmv: contributor.liveGmv,
      ...(contributor.refundAmount === undefined ? {} : { refundAmount: contributor.refundAmount }),
      liveGsv: contributor.liveGsv,
    });
  }

  const contributorRows = Array.from(contributorMap.values()).sort((left, right) => {
    const rightMagnitude = Math.max(
      Math.abs(right.liveGmv),
      Math.abs(right.refundAmount ?? 0),
      Math.abs(right.liveGsv)
    );
    const leftMagnitude = Math.max(
      Math.abs(left.liveGmv),
      Math.abs(left.refundAmount ?? 0),
      Math.abs(left.liveGsv)
    );
    if (rightMagnitude !== leftMagnitude) {
      return rightMagnitude - leftMagnitude;
    }
    if (right.liveGmv !== left.liveGmv) {
      return right.liveGmv - left.liveGmv;
    }
    if ((right.refundAmount ?? 0) !== (left.refundAmount ?? 0)) {
      return (right.refundAmount ?? 0) - (left.refundAmount ?? 0);
    }
    if (right.liveGsv !== left.liveGsv) {
      return right.liveGsv - left.liveGsv;
    }
    return left.influencerName.localeCompare(right.influencerName, 'zh-CN');
  });
  const visibleContributorRows = contributorRows.slice(0, 8);
  const contributorsHtml = visibleContributorRows.length
    ? visibleContributorRows
        .map((item) => {
          const contributorName = `【${item.platform}】${item.influencerName}`;
          const metricText = buildContributorMetricParts(item, gsvLabel).join('，');
          return `
            <div class="${styles.trendTooltipContributorRow}">
              <span class="${styles.trendTooltipContributorName}">${escapeTooltipHtml(contributorName)}</span>
              <span class="${styles.trendTooltipContributorMetrics}">${escapeTooltipHtml(metricText)}</span>
            </div>
          `;
        })
        .join('')
    : `<div class="${styles.trendTooltipEmpty}">当日暂无匹配达人</div>`;
  const contributorsMoreHtml =
    contributorRows.length > visibleContributorRows.length
      ? `<div class="${styles.trendTooltipMore}">等 ${contributorRows.length - visibleContributorRows.length} 位达人</div>`
      : '';
  const countHint =
    contributorCount > 0
      ? `<div class="${styles.trendTooltipFooter}">${escapeTooltipHtml(countLabel)}：${contributorCount} 位</div>`
      : '';

  return `
    <div class="${styles.trendTooltipCard}">
      <div class="${styles.trendTooltipDate}">${escapeTooltipHtml(dateLabel)}</div>
      <div class="${styles.trendTooltipMetrics}">
        <div class="${styles.trendTooltipMetricItem}">
          <span>GMV</span>
          <strong>${escapeTooltipHtml(formatTooltipCurrency(gmvValue))}</strong>
        </div>
        <div class="${styles.trendTooltipMetricItem}">
          <span>${escapeTooltipHtml(gsvLabel)}</span>
          <strong>${escapeTooltipHtml(formatTooltipCurrency(gsvValue))}</strong>
        </div>
      </div>
      <section class="${styles.trendTooltipSection}">
        <h4 class="${styles.trendTooltipSectionTitle}">当日达人明细</h4>
        <div class="${styles.trendTooltipContributorList}">
          ${contributorsHtml}
        </div>
        ${contributorsMoreHtml}
      </section>
      ${countHint}
    </div>
  `;
}
