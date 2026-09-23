import type { Dispatch, Key, SetStateAction } from 'react';
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { MessageInstance } from 'antd/es/message/interface';
import { resolveClientErrorMessage, resolveClientErrorStatus } from '@/lib/client-error';
import {
  createCreator,
  deleteCreator,
  updateCreator,
} from '../_lib/creator-library-api';
import type {
  CreatorLibraryItem,
  CreatorLibraryPayload,
} from '../_lib/creator-library-types';

interface UseCreatorLibraryRecordActionsParams {
  messageApi: MessageInstance;
  editingItem: CreatorLibraryItem | null;
  refreshLibrary: () => void;
  refreshCreatorFilterOptions: () => void;
  setFormOpen: Dispatch<SetStateAction<boolean>>;
  setEditingItem: Dispatch<SetStateAction<CreatorLibraryItem | null>>;
  setFollowItem: Dispatch<SetStateAction<CreatorLibraryItem | null>>;
  setAssignItem: Dispatch<SetStateAction<CreatorLibraryItem | null>>;
  setSelectedRowKeys: Dispatch<SetStateAction<Key[]>>;
}

interface UpdateCreatorVariables {
  id: number;
  payload: CreatorLibraryPayload;
}

interface DeleteCreatorVariables {
  id: number;
  expectedUpdatedAt: string;
}

export function useCreatorLibraryRecordActions({
  messageApi,
  editingItem,
  refreshLibrary,
  refreshCreatorFilterOptions,
  setFormOpen,
  setEditingItem,
  setFollowItem,
  setAssignItem,
  setSelectedRowKeys,
}: UseCreatorLibraryRecordActionsParams) {
  const createMutation = useMutation({
    mutationFn: createCreator,
    onSuccess: () => {
      messageApi.success('达人已新增');
      setFormOpen(false);
      setEditingItem(null);
      refreshLibrary();
      refreshCreatorFilterOptions();
    },
    onError: (err) => messageApi.error(resolveClientErrorMessage(err, '新增达人失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: UpdateCreatorVariables) => updateCreator(id, payload),
    onSuccess: () => {
      messageApi.success('达人资料已更新');
      setFormOpen(false);
      setEditingItem(null);
      setFollowItem(null);
      setAssignItem(null);
      refreshLibrary();
      refreshCreatorFilterOptions();
    },
    onError: (err) => {
      if (resolveClientErrorStatus(err) === 409) {
        setFormOpen(false);
        setEditingItem(null);
        setAssignItem(null);
        refreshLibrary();
      }
      messageApi.error(resolveClientErrorMessage(err, '更新达人失败'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: DeleteCreatorVariables) =>
      deleteCreator(id, expectedUpdatedAt),
    onSuccess: () => {
      messageApi.success('达人已删除');
      setSelectedRowKeys([]);
      refreshLibrary();
      refreshCreatorFilterOptions();
    },
    onError: (err) => {
      if (resolveClientErrorStatus(err) === 409) {
        refreshLibrary();
      }
      messageApi.error(resolveClientErrorMessage(err, '删除达人失败'));
    },
  });

  const handleSave = useCallback(
    (payload: CreatorLibraryPayload) => {
      if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, payload });
        return;
      }
      createMutation.mutate(payload);
    },
    [createMutation, editingItem, updateMutation]
  );

  const handleUpdateExisting = useCallback(
    (item: CreatorLibraryItem | null, payload: CreatorLibraryPayload) => {
      if (!item) {
        return;
      }
      updateMutation.mutate({ id: item.id, payload });
    },
    [updateMutation]
  );

  return {
    createMutation,
    deleteMutation,
    handleSave,
    handleUpdateExisting,
    updateMutation,
  };
}
