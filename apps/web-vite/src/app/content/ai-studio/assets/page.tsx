'use client';

import { AiStudioAssetsView } from '../_components/ai-studio-assets-view';
import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';

export default function AiStudioAssetsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="原片"
        purpose="这里的原片就是素材库里的原片，与素材库共用素材身份、授权状态和元数据，这里不会产生复制记录。"
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
