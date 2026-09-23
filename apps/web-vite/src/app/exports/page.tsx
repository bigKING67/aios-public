/**
 * Vite route page for the report export entry.
 *
 * 说明：
 * - 页面级别无本地交互，保持静态占位
 * - 布局交互由 Layout 组件处理
 */

import { Card, Empty } from 'antd';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { REPORT_EXPORT_PERMISSIONS } from '@/lib/report-permissions';

export default function ExportsPage() {
  return (
    <ProtectedRoute requiredPermission={REPORT_EXPORT_PERMISSIONS} permissionMode="any">
      <Layout>
        <Card>
          <Empty description="导出功能开发中..." />
        </Card>
      </Layout>
    </ProtectedRoute>
  );
}
