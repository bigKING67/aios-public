'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { RemixOutputsView } from '../_components/remix-outputs-view';

export default function AiStudioOutputsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="成片"
        purpose="框架混剪的批次和单条成片。成功的成片会回存为素材库资产，并记录由哪些片段组成。"
      >
        {(capabilities) => <RemixOutputsView capabilities={capabilities} />}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
