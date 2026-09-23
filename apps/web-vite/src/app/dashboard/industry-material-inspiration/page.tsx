import { ProtectedRoute } from '@/components/protected-route';
import { IndustryMaterialInspirationClient } from './industry-material-inspiration-client';

export default function IndustryMaterialInspirationPage() {
  return (
    <ProtectedRoute>
      <IndustryMaterialInspirationClient />
    </ProtectedRoute>
  );
}
