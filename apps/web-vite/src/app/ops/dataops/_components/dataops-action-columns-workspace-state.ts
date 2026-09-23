'use client';
import { useDataOpsTableColumnsState } from './dataops-table-columns-state';
import { useDataOpsActionHandlersState } from './dataops-action-handlers-state';
import { useDataOpsTriggerSubmitState } from './dataops-trigger-submit-state';
import { useDataOpsGlobalActionState } from './dataops-global-action-state';

type ActionHandlersParams = Parameters<typeof useDataOpsActionHandlersState>[0];
type GlobalActionParams = Parameters<typeof useDataOpsGlobalActionState>[0];
type TriggerSubmitParams = Parameters<typeof useDataOpsTriggerSubmitState>[0];
type TableColumnsParams = Omit<
  Parameters<typeof useDataOpsTableColumnsState>[0],
  | 'globalActionBusy'
  | 'onChannelWebhookTest'
  | 'onOpenChannelManualNotifyModal'
  | 'onOpenNotificationEventRetryModal'
  | 'onPipelineAction'
>;

type UseDataOpsActionColumnsWorkspaceStateParams = {
  actionHandlers: ActionHandlersParams;
  globalAction: GlobalActionParams;
  tableColumns: TableColumnsParams;
  triggerSubmit: TriggerSubmitParams;
};

export function useDataOpsActionColumnsWorkspaceState({
  actionHandlers,
  globalAction,
  tableColumns,
  triggerSubmit,
}: UseDataOpsActionColumnsWorkspaceStateParams) {
  const actionHandlersState = useDataOpsActionHandlersState(actionHandlers);
  const globalActionState = useDataOpsGlobalActionState(globalAction);
  const triggerSubmitState = useDataOpsTriggerSubmitState(triggerSubmit);
  const tableColumnsState = useDataOpsTableColumnsState({
    ...tableColumns,
    globalActionBusy: globalActionState.globalActionBusy,
    onChannelWebhookTest: actionHandlersState.handleChannelWebhookTest,
    onOpenChannelManualNotifyModal: actionHandlersState.openChannelManualNotifyModal,
    onOpenNotificationEventRetryModal: actionHandlersState.openNotificationEventRetryModal,
    onPipelineAction: actionHandlersState.handlePipelineAction,
  });

  return {
    ...actionHandlersState,
    ...globalActionState,
    ...triggerSubmitState,
    ...tableColumnsState,
  };
}
