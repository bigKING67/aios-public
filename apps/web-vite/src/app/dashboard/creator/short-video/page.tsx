import { ProtectedRoute } from '@/components/protected-route';
import { CreatorShortVideoDashboardClient } from '../_components/creator-short-video-dashboard-client';

export default function CreatorShortVideoDashboardPage() {
  return (
    <ProtectedRoute>
      <CreatorShortVideoDashboardClient />
    </ProtectedRoute>
  );
}
