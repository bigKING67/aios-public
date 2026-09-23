import { Navigate, useParams } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { LiveCenterAnalysisResultClient } from '../../../_components/live-center-analysis-result-client';

export default function LiveCenterAnalysisResultPage() {
  const { analysisId, sessionId } = useParams<{ analysisId: string; sessionId: string }>();
  if (!sessionId || !analysisId) {
    return <Navigate to={ROUTE_PATHS.contentLiveCenter} replace />;
  }

  return (
    <LiveCenterAnalysisResultClient
      analysisId={analysisId}
      sessionId={sessionId}
    />
  );
}
