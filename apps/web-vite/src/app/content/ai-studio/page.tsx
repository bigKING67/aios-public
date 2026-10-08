'use client';

import { AiStudioHome } from './_components/ai-studio-home';
import { AiStudioShell } from './_components/ai-studio-shell';

export default function AiStudioHomePage() {
  return (
    <AiStudioShell>
      <AiStudioHome />
    </AiStudioShell>
  );
}
