import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import styles from './aios-global-navigation.module.css';

const AiosGlobalNavigation = lazy(() => import('./aios-global-navigation').then((module) => ({ default: module.AiosGlobalNavigation })));

/** Load navigation independently so login and page chunks retain their boundaries. */
export function AiosGlobalFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === ROUTE_PATHS.login || pathname === ROUTE_PATHS.joinAiIntern) return children;
  return (
    <div className={styles.frame}>
      <Suspense fallback={<div className={styles.header} />}>
        <AiosGlobalNavigation />
      </Suspense>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
