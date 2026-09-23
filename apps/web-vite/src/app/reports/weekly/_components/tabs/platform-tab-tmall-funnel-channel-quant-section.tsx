import { QuantAttributionSectionFrame } from './platform-tab-quant-attribution-section-frame';
import type {
  TmallFunnelChannelQuantSectionProps,
} from './platform-tab-tmall-funnel-leaf-contracts';

export type {
  TmallFunnelChannelQuantSectionProps,
} from './platform-tab-tmall-funnel-leaf-contracts';

export function TmallFunnelChannelQuantSection({
  title,
  tableProps,
}: TmallFunnelChannelQuantSectionProps) {
  return (
    <QuantAttributionSectionFrame
      title={title}
      description="使用 Shapley 路径分解（考虑因子交互）识别驱动因子贡献，贡献为负表示拖累，贡献为正表示拉动。"
      tableProps={tableProps}
      emptyDescription="暂无量化归因结果"
    />
  );
}
