'use client';
import { useDataOpsUrlStateEffects } from './dataops-url-state-effects';
import { useDataOpsOverviewDerivedState } from './dataops-overview-derived-state';
import { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import { useDataOpsNotificationWorkspaceState } from './dataops-notification-workspace-state';
import { useDataOpsBatchWorkspaceState } from './dataops-batch-workspace-state';
import { useDataOpsActionColumnsWorkspaceState } from './dataops-action-columns-workspace-state';
import { buildDataOpsHubClientState } from './dataops-hub-client-state-contract';
import { buildDataOpsOverviewDerivedStateOptions } from './dataops-overview-derived-params';
import {
  buildDataOpsActionColumnsWorkspaceParams,
  buildDataOpsBatchWorkspaceParams,
  buildDataOpsNotificationWorkspaceParams,
} from './dataops-hub-client-state-workspace-params';
import { buildDataOpsUrlStateEffectsOptions } from './dataops-url-state-params';

export function useDataOpsHubClientState() {
  const foundationState = useDataOpsHubFoundationState();

  const { auditQuickFilterState } = foundationState;

  const notificationWorkspaceState = useDataOpsNotificationWorkspaceState(
    buildDataOpsNotificationWorkspaceParams(foundationState),
  );

  const urlState = useDataOpsUrlStateEffects(
    buildDataOpsUrlStateEffectsOptions({
      foundationState,
      notificationWorkspaceState,
    }),
  );

  const batchWorkspaceState = useDataOpsBatchWorkspaceState(
    buildDataOpsBatchWorkspaceParams(foundationState),
  );

  const actionColumnsWorkspaceState = useDataOpsActionColumnsWorkspaceState(
    buildDataOpsActionColumnsWorkspaceParams({
      batchWorkspaceState,
      foundationState,
      notificationWorkspaceState,
      urlState,
    }),
  );
  const overviewDerivedState = useDataOpsOverviewDerivedState(
    buildDataOpsOverviewDerivedStateOptions(foundationState),
  );
  return buildDataOpsHubClientState({
    actionColumnsWorkspaceState,
    auditQuickFilterState,
    batchWorkspaceState,
    foundationState,
    notificationWorkspaceState,
    overviewDerivedState,
    urlState,
  });
}
