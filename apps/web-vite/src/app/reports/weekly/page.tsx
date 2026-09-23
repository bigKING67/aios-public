'use client';

import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { pickQueryValue } from '@/app/_shared/route-query';
import { REPORT_READ_PERMISSIONS } from '@/lib/report-permissions';
import { WeeklyReportClient } from './_components/weekly-report-client';

export default function WeeklyReportPage() {
  const [searchParams] = useSearchParams();
  const reportId = pickQueryValue(searchParams, 'reportId');
  const initialWeekPeriod = pickQueryValue(searchParams, 'weekPeriod') || pickQueryValue(searchParams, 'week_period');

  return (
    <ProtectedRoute requiredPermission={REPORT_READ_PERMISSIONS} permissionMode="any">
      <div className="min-h-[100dvh] light-theme report-page-light">
        <WeeklyReportClient reportId={reportId} initialWeekPeriod={initialWeekPeriod} />
      </div>
    </ProtectedRoute>
  );
}
