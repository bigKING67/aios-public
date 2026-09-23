import { QuantAttributionSectionFrame } from './platform-tab-quant-attribution-section-frame';
import type {
  DouyinCardSourceQuantSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';

export type {
  DouyinCardSourceQuantSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';

export function DouyinCardSourceQuantSection({
  tableProps,
}: DouyinCardSourceQuantSectionProps) {
  return (
    <QuantAttributionSectionFrame
      title="量化归因（GMV = 商品卡曝光人数 × 点击率 × 点击成交率）"
      description="使用 Shapley 路径分解（考虑因子交互）识别驱动因子贡献，贡献为负表示拖累，贡献为正表示拉动。"
      tableProps={tableProps}
      emptyDescription="暂无商品卡量化归因结果"
    />
  );
}
