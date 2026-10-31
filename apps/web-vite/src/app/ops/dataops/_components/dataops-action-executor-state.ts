import { useCallback, useState } from 'react';

import type { DataOpsActionRequest, DataOpsActionResponse } from '@/types/dataops';
import { getActionErrorMessage } from './dataops-action-helpers';
import type { DataOpsMessageApi } from './dataops-feedback-types';

export function useDataOpsActionExecutorState(options: {
  message: DataOpsMessageApi;
  mutateAction: (payload: DataOpsActionRequest) => Promise<DataOpsActionResponse>;
  refetchRuntime: () => Promise<unknown>;
}) {
  const { message, mutateAction, refetchRuntime } = options;
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const executeAction = useCallback(
    async (payload: DataOpsActionRequest, actionKey: string): Promise<boolean> => {
      try {
        setActiveActionKey(actionKey);
        const result = await mutateAction(payload);
        if (result.success) {
          message.success(result.message);
          await refetchRuntime();
          return true;
        }

        message.warning(result.message);
        await refetchRuntime();
        return false;
      } catch (error) {
        message.error(getActionErrorMessage(error));
        return false;
      } finally {
        setActiveActionKey(null);
      }
    },
    [message, mutateAction, refetchRuntime]
  );

  return {
    activeActionKey,
    executeAction,
  };
}
