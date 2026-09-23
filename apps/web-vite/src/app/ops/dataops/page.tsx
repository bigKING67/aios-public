'use client';

import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { DATAOPS_READ_PERMISSIONS } from '@/lib/dataops-permissions';
import { DataOpsHubClient } from './_components/dataops-hub-client';

export default function DataOpsPage() {
  return (
    <ProtectedRoute requiredPermission={DATAOPS_READ_PERMISSIONS} permissionMode="any">
      <Layout>
        <DataOpsHubClient />
      </Layout>
    </ProtectedRoute>
  );
}
