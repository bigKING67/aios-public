'use client';

import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { getCurrentMonthPeriod, pickQueryValue } from '@/app/_shared/route-query';
import { REPORT_READ_PERMISSIONS } from '@/lib/report-permissions';
import { MonthlyReportClient } from './_components/monthly-report-client';

export default function MonthlyReportPage() {
  const [searchParams] = useSearchParams();
  const reportId = pickQueryValue(searchParams, 'reportId') || getCurrentMonthPeriod();

  if (!/^\d{4}-\d{2}$/.test(reportId)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 text-center">
        <h1 className="text-xl font-bold text-status-danger">无效的报告 ID</h1>
        <p className="text-text-tertiary mt-2">报告 ID 必须符合格式：YYYY-MM（如 2026-02）</p>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredPermission={REPORT_READ_PERMISSIONS} permissionMode="any">
      <div className="min-h-[100dvh] bg-bg-global p-3 sm:p-4 lg:p-6">
        <MonthlyReportClient reportId={reportId} />
      </div>
    </ProtectedRoute>
  );
}
