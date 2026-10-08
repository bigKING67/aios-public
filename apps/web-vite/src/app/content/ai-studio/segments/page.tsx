'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { SegmentsWorkspace } from '../_components/segments-workspace';

export default function AiStudioSegmentsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="片段素材"
        purpose="片段由原片、时间区间、分类标签和确认状态组成，是框架混剪的选材来源。片段只引用原片，不复制媒体。"
      >
        {(capabilities) => (
          <SegmentsWorkspace canWrite={capabilities.canWrite} openAccess={capabilities.openAccess} products={capabilities.products} />
        )}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
