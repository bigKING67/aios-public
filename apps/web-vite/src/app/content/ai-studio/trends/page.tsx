'use client';

import { AiStudioPlaceholder } from '../_components/ai-studio-placeholder';
import { AiStudioShell } from '../_components/ai-studio-shell';

export default function AiStudioTrendsPage() {
  return (
    <AiStudioShell>
      <AiStudioPlaceholder
        title="行业热点"
        purpose="采集和拆解同类爆款内容，产出每日出片方向。外部爆款视频只用于拆解，不进入混剪素材池。"
        currentState="行业热点属于后续阶段，目前不在导航中显示。开工前会先评估与行业资讯、行业素材灵感是否重叠。"
        plannedCapabilities={[
          '爆款内容采集与结构拆解',
          '每日出片方向报告',
        ]}
      />
    </AiStudioShell>
  );
}
