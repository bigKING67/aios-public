'use client';

import { CreatorChartPanel, type CreatorChartPanelProps } from './creator-chart-panel';
import shellStyles from './creator-dashboard.module.css';
import styles from './creator-live-dashboard.module.css';

export interface CreatorChartLayoutPanel extends CreatorChartPanelProps {
  narrow?: boolean;
}

export interface CreatorChartLayoutProps {
  panels: ReadonlyArray<CreatorChartLayoutPanel>;
}

export function CreatorChartLayout({ panels }: CreatorChartLayoutProps) {
  const layoutClassName = [
    shellStyles.chartLayout,
    panels.length <= 1 ? styles.singleChartLayout : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={layoutClassName}>
      {panels.map(({ narrow, className, ...panel }, index) => {
        const panelClassName = [className, narrow ? styles.narrowPanel : undefined].filter(Boolean).join(' ');
        return (
          <CreatorChartPanel
            key={`${panel.title}-${index}`}
            {...panel}
            className={panelClassName || undefined}
          />
        );
      })}
    </section>
  );
}
