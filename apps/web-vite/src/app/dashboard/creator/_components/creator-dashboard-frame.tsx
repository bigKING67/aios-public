'use client';

import type { ReactNode } from 'react';
import styles from './creator-dashboard.module.css';
import { CreatorDashboardTopBar, type CreatorDashboardTopBarProps } from './creator-dashboard-top-bar';

export interface CreatorDashboardFrameProps extends CreatorDashboardTopBarProps {
  messageContextHolder: ReactNode;
  loadError: string;
  mainClassName: string;
  errorClassName: string;
  children: ReactNode;
}

export function CreatorDashboardFrame({
  messageContextHolder,
  loadError,
  mainClassName,
  errorClassName,
  children,
  ...topBarProps
}: CreatorDashboardFrameProps) {
  return (
    <div className={styles.pageRoot}>
      {messageContextHolder}
      <div className={styles.backdropGlow} aria-hidden />
      <div className={styles.surface}>
        <CreatorDashboardTopBar {...topBarProps} />

        <main className={`${styles.dashboardContent} ${mainClassName}`}>
          {loadError ? (
            <section className={errorClassName}>
              <p>{loadError}</p>
            </section>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
