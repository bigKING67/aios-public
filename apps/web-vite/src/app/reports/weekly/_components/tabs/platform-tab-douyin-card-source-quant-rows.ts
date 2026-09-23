import { buildCardSourceReasonAction } from './platform-tab-douyin-diagnostics';
import { buildDouyinQuantRowsFromFactors } from './platform-tab-douyin-quant-row-builder';
import type {
  DouyinCardSourceRow,
  QuantAttributionRow,
} from './platform-tab-types';

export function buildDouyinCardSourceQuantRows(
  row: DouyinCardSourceRow | undefined
): QuantAttributionRow[] {
  if (!row) {
    return [];
  }

  return buildDouyinQuantRowsFromFactors(
    [
      {
        factorKey: 'card_exposure_user_count',
        factorLabel: '商品卡曝光人数',
        currValue: row.currCardExposureUserCount,
        prevValue: row.prevCardExposureUserCount,
      },
      {
        factorKey: 'card_click_rate',
        factorLabel: '点击率',
        currValue: row.currCardClickRate ?? 0,
        prevValue: row.prevCardClickRate ?? 0,
      },
      {
        factorKey: 'card_click_to_pay_rate',
        factorLabel: '点击成交率',
        currValue: row.currCardClickToPayRate ?? 0,
        prevValue: row.prevCardClickToPayRate ?? 0,
      },
    ],
    buildCardSourceReasonAction
  );
}
