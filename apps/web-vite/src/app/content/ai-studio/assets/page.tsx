'use client';

import { AiStudioAssetsView } from '../_components/ai-studio-assets-view';
import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';

export default function AiStudioAssetsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="原片"
        purpose="点击原片人工标注，或用 AI 切段自动切分。"
      >
        {(capabilities) => (
          <AiStudioAssetsView
            enterpriseTag={capabilities.enterpriseTag}
            products={capabilities.products}
            canUpload={capabilities.canUpload}
          />
        )}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
