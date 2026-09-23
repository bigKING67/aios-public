'use client';
import { DataOpsHubOverview } from './dataops-hub-overview';
import { DataOpsHubOverlayLayer } from './dataops-hub-overlay-layer';
import { DataOpsHubTabContent } from './dataops-hub-tab-content';
import { useDataOpsHubClientState } from './dataops-hub-client-state';
import {
  pickDataOpsHubOverviewProps,
  pickDataOpsHubOverlayLayerProps,
  pickDataOpsHubTabContentProps,
} from './dataops-hub-view-contracts';
import shellStyles from './dataops-shell.module.css';

export function DataOpsHubClient() {
  const state = useDataOpsHubClientState();
  const overviewProps = pickDataOpsHubOverviewProps(state);
  const overlayLayerProps = pickDataOpsHubOverlayLayerProps(state);
  const tabContentProps = pickDataOpsHubTabContentProps(state);

  return (
    <div className={shellStyles.pageRoot}>
      <div className={shellStyles.backdropGlow} aria-hidden />

      <div className={shellStyles.surface}>
        <DataOpsHubOverview {...overviewProps} />

        <DataOpsHubTabContent {...tabContentProps} />
      </div>

      <DataOpsHubOverlayLayer {...overlayLayerProps} />
    </div>
  );
}

export default DataOpsHubClient;
