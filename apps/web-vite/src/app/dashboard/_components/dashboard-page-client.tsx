'use client';

import { DashboardPageShell } from './dashboard-page-shell';
import { configureDashboardDayjsLocale } from './dashboard-dayjs-locale';
import { useDashboardPageShellProps } from './dashboard-page-content-controller';
import { useDashboardPageEffects } from './dashboard-page-effects-controller';
import { useDashboardPageStateController } from './dashboard-page-state-controller';
import type { DashboardPageClientProps } from './dashboard-types';
import './dashboard-token-aliases.css';

configureDashboardDayjsLocale();

export function DashboardPageClient({ initialFilters }: DashboardPageClientProps) {
  const controller = useDashboardPageStateController({ initialFilters });

  useDashboardPageEffects(controller);
  const shellProps = useDashboardPageShellProps(controller);

  return <DashboardPageShell {...shellProps} />;
}

export default DashboardPageClient;
