import { QuantAttributionSectionFrame } from './platform-tab-quant-attribution-section-frame';
import type {
  DouyinLiveQuantSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';

export type {
  DouyinLiveQuantSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';

export function DouyinLiveQuantSection({
  tableProps,
}: DouyinLiveQuantSectionProps) {
  return (
    <QuantAttributionSectionFrame
      title="量化归因（GMV = 曝光人数 × 看播率 × 商品曝光率 × 商品点击率 × 商品点击成交转化率 × 客单价）"
      description="使用 Shapley 路径分解（考虑因子交互）识别驱动因子贡献，贡献为负表示拖累，贡献为正表示拉动。"
      tableProps={tableProps}
      emptyDescription="暂无直播量化归因结果"
    />
  );
}
