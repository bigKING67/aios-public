import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { MessageInstance } from 'antd/es/message/interface';
import { resolveClientErrorMessage, resolveClientErrorStatus } from '@/lib/client-error';
import {
  createCreatorFollowLog,
  deleteCreatorFollowLog,
  updateCreatorFollowLog,
} from '../_lib/creator-library-api';
import type {
  CreatorLibraryFollowLogPayload,
  CreatorLibraryItem,
} from '../_lib/creator-library-types';

interface UseCreatorLibraryFollowLogActionsParams {
  messageApi: MessageInstance;
  followItem: CreatorLibraryItem | null;
  refreshLibrary: () => void;
  refreshActiveCreatorFollowLogs: (creatorId: number) => void;
  setFollowLogRevision: Dispatch<SetStateAction<number>>;
}

interface CreateFollowLogVariables {
  creatorId: number;
  payload: CreatorLibraryFollowLogPayload;
}

interface UpdateFollowLogVariables {
  creatorId: number;
  logId: number;
  payload: CreatorLibraryFollowLogPayload;
}

interface DeleteFollowLogVariables {
  creatorId: number;
  logId: number;
  expectedUpdatedAt: string;
}

export function useCreatorLibraryFollowLogActions({
  messageApi,
  followItem,
  refreshLibrary,
  refreshActiveCreatorFollowLogs,
  setFollowLogRevision,
}: UseCreatorLibraryFollowLogActionsParams) {
  const handleFollowLogMutationSuccess = useCallback(
    (creatorId: number, successMessage: string) => {
      messageApi.success(successMessage);
      setFollowLogRevision((revision) => revision + 1);
      refreshLibrary();
      refreshActiveCreatorFollowLogs(creatorId);
    },
    [messageApi, refreshActiveCreatorFollowLogs, refreshLibrary, setFollowLogRevision]
  );

  const createFollowLogMutation = useMutation({
    mutationFn: ({ creatorId, payload }: CreateFollowLogVariables) =>
      createCreatorFollowLog(creatorId, payload),
    onSuccess: (_result, variables) => {
      handleFollowLogMutationSuccess(variables.creatorId, '跟进记录已新增');
    },
    onError: (err) => messageApi.error(resolveClientErrorMessage(err, '新增跟进记录失败')),
  });

  const updateFollowLogMutation = useMutation({
    mutationFn: ({ creatorId, logId, payload }: UpdateFollowLogVariables) =>
      updateCreatorFollowLog(creatorId, logId, payload),
    onSuccess: (_result, variables) => {
      handleFollowLogMutationSuccess(variables.creatorId, '跟进记录已更新');
    },
    onError: (err) => {
      if (resolveClientErrorStatus(err) === 409) {
        refreshLibrary();
        if (followItem) {
          refreshActiveCreatorFollowLogs(followItem.id);
        }
      }
      messageApi.error(resolveClientErrorMessage(err, '更新跟进记录失败'));
    },
  });

  const deleteFollowLogMutation = useMutation({
    mutationFn: ({ creatorId, logId, expectedUpdatedAt }: DeleteFollowLogVariables) =>
      deleteCreatorFollowLog(creatorId, logId, expectedUpdatedAt),
    onSuccess: (_result, variables) => {
      handleFollowLogMutationSuccess(variables.creatorId, '跟进记录已删除');
    },
    onError: (err) => {
      if (resolveClientErrorStatus(err) === 409) {
        refreshLibrary();
        if (followItem) {
          refreshActiveCreatorFollowLogs(followItem.id);
        }
      }
      messageApi.error(resolveClientErrorMessage(err, '删除跟进记录失败'));
    },
  });

  return {
    createFollowLogMutation,
    deleteFollowLogMutation,
    updateFollowLogMutation,
  };
}
