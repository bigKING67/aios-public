'use client';

import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import {
  CompetitorOverviewWorkspace,
  OVERVIEW_PAGE_PURPOSE,
  OVERVIEW_PAGE_TITLE,
} from '../_components/competitor-overview-workspace';

export default function AiStudioCompetitorPage() {
  return (
    <AiStudioShell>
      <AiStudioCapabilityGate title={OVERVIEW_PAGE_TITLE} purpose={OVERVIEW_PAGE_PURPOSE}>
        {(capabilities) => <CompetitorOverviewWorkspace canWrite={capabilities.canWrite} />}
      </AiStudioCapabilityGate>
    </AiStudioShell>
  );
}
