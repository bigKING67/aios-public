'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { SegmentsWorkspace } from '../_components/segments-workspace';

export default function AiStudioSellingPointsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="卖点片段"
        purpose="卖点片段是框架段里讲某个卖点的一小段，是卖点混剪的选材来源。片段只引用原片，不复制媒体。"
      >
        {(capabilities) => (
          <SegmentsWorkspace
            kind="sellingPoint"
            canWrite={capabilities.canWrite}
            openAccess={capabilities.openAccess}
            products={capabilities.products}
          />
        )}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
