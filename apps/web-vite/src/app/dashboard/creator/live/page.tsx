import { ProtectedRoute } from '@/components/protected-route';
import { CreatorLiveDashboardClient } from '../_components/creator-live-dashboard-client';

export default function CreatorLiveDashboardPage() {
  return (
    <ProtectedRoute>
      <CreatorLiveDashboardClient />
    </ProtectedRoute>
  );
}
