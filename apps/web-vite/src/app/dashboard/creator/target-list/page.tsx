import { Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export default function CreatorTargetListDashboardPage() {
  return (
    <ProtectedRoute>
      <Navigate to={ROUTE_PATHS.dashboardCreatorLive} replace />
    </ProtectedRoute>
  );
}
