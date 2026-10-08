'use client';

import { Navigate, useLocation } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { ContentAssetsClient } from './_components/content-assets-client';

export default function ContentAssetsPage() {
  // Saved AI editing links (`?editingRun=`) now open in the AI studio workspace;
  // forward the whole query and hash so no other deep-link state is lost.
  const { search, hash } = useLocation();
  if (new URLSearchParams(search).get('editingRun')) {
    return <Navigate replace to={`${ROUTE_PATHS.contentAiStudioEditing}${search}${hash}`} />;
  }

  return <ContentAssetsClient />;
}
