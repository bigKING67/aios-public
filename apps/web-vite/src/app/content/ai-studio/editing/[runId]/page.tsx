'use client';

import { Navigate, useLocation, useParams } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { AiStudioShell } from '../../_components/ai-studio-shell';

/**
 * The editing workspace selects a task through `?editingRun=`; this path keeps a
 * stable shareable URL and hands off to that existing selection contract while
 * preserving any other query parameters and the hash.
 */
export default function AiStudioEditingRunPage() {
  const { runId = '' } = useParams<{ runId: string }>();
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (runId) params.set('editingRun', runId);
  const query = params.toString();
  const target = `${ROUTE_PATHS.contentAiStudioEditing}${query ? `?${query}` : ''}${hash}`;

  return (
    <AiStudioShell>
      <Navigate replace to={target} />
    </AiStudioShell>
  );
}
