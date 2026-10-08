'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { SegmentSuggestPanel } from '../_components/segment-suggest-panel';

export default function AiStudioAnalysisPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate
        title="AI 分析"
        purpose="选原片，AI 结合画面和声音把原片切成片段并打上框架标签；人工确认后进入片段素材，供混剪使用。"
      >
        {(capabilities) => <SegmentSuggestPanel capabilities={capabilities} />}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
