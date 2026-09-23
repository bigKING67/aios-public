import { normalizeToken, toOptionalNumber, toSafeNumber } from './platform-tab-formatters';
import type { QuantAttributionRow } from './platform-tab-types';
import type {
  ChannelQuantAttributionItem,
  QuantAttributionItem,
} from './platform-tab-row-mapper-types';

function mapQuantAttributionBase(
  item: QuantAttributionItem,
  lnContribution: number
): QuantAttributionRow {
  return {
    rowId: [String(item.factor_key || '--'), String(item.priority || '--')].join('|'),
    factorKey: String(item.factor_key || '--'),
    factorLabel: String(item.factor_label || '--'),
    currValue: toSafeNumber(item.curr_value),
    prevValue: toSafeNumber(item.prev_value),
    changeRate: toOptionalNumber(item.change_rate),
    lnContribution,
    contributionRate: toOptionalNumber(item.contribution_rate),
    effect: String(item.effect || '--'),
    reason: String(item.reason || '--'),
    action: String(item.action || '--'),
    priority: String(item.priority || '--'),
  };
}

export function mapQuantAttributionItem(item: QuantAttributionItem): QuantAttributionRow {
  return mapQuantAttributionBase(item, toSafeNumber(item.ln_contribution));
}

export function buildQuantRowsByChannel(
  items: readonly ChannelQuantAttributionItem[]
): Map<string, QuantAttributionRow[]> {
  const rowsByChannel = new Map<string, QuantAttributionRow[]>();

  for (const channelItem of items) {
    const channelKey = normalizeToken(String(channelItem?.traffic_channel || ''));
    if (!channelKey) {
      continue;
    }

    const channelQuantRowsRaw = Array.isArray(channelItem?.quant_attribution)
      ? channelItem.quant_attribution
      : [];
    if (channelQuantRowsRaw.length === 0) {
      continue;
    }

    const mappedRows = channelQuantRowsRaw.map((item) =>
      mapQuantAttributionBase(
        item,
        toOptionalNumber(item.ln_contribution) ?? toSafeNumber(item.contribution_value)
      )
    );
    if (mappedRows.length > 0) {
      rowsByChannel.set(channelKey, mappedRows);
    }
  }

  return rowsByChannel;
}
