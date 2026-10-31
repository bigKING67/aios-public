'use client';

import { AiStudioShell } from '../_components/ai-studio-shell';
import { TeamOutputWorkspace } from '../_components/team-output-workspace';

/**
 * No studio capability gate: accounts limited to 团队产出 cannot read the studio's capabilities, and the
 * team-output endpoints answer 503 themselves while the studio is off.
 */
export default function AiStudioTeamOutputPage() {
  return (
    <AiStudioShell>
      <TeamOutputWorkspace />
    </AiStudioShell>
  );
}
