'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pickQueryValue } from '@/app/_shared/route-query';
import { DashboardPageClient } from './_components/dashboard-page-client';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();

  const initialFilters = useMemo(
    () => ({
      dimension: pickQueryValue(searchParams, 'dimension'),
      tab: pickQueryValue(searchParams, 'tab'),
      mode: pickQueryValue(searchParams, 'mode'),
      day: pickQueryValue(searchParams, 'day'),
      week: pickQueryValue(searchParams, 'week'),
      month: pickQueryValue(searchParams, 'month'),
      year: pickQueryValue(searchParams, 'year'),
      start: pickQueryValue(searchParams, 'start'),
      end: pickQueryValue(searchParams, 'end'),
    }),
    [searchParams],
  );

  return <DashboardPageClient initialFilters={initialFilters} />;
}
