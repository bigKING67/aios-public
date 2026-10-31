'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { COMPETITOR_PAGE_PURPOSE, COMPETITOR_PAGE_TITLE, CompetitorWorkspace } from '../_components/competitor-workspace';

export default function AiStudioTrendsPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate title={COMPETITOR_PAGE_TITLE} purpose={COMPETITOR_PAGE_PURPOSE}>
        {(capabilities) => <CompetitorWorkspace canWrite={capabilities.canWrite} />}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
