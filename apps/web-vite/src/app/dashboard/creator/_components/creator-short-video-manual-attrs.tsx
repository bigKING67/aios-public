'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { MessageInstance } from 'antd/es/message/interface';
import { request } from '@/lib/request';
import { normalizeErrorMessage } from './creator-helpers';
import type {
  CreatorShortVideoDetailRow,
  CreatorShortVideoManualAttrsDeleteResponse,
  CreatorShortVideoManualAttrsResponse,
} from './creator-short-video-dashboard-types';
import { buildCreatorShortVideoManualAttrColumns } from './creator-short-video-manual-attrs-columns';
import {
  appendManualOptionValue,
  buildCreatorShortVideoManualDeletePayload,
  buildCreatorShortVideoManualDraft,
  buildCreatorShortVideoManualPayload,
  buildManualSelectOptions,
  CREATOR_TYPE_INPUT_REJECTED_MESSAGE,
  CREATOR_TYPE_OPTIONS,
  isCreatorTypeInputRejected,
  normalizeCreatorTypeInput,
  normalizeCreatorTypeValue,
  normalizeManualSelectInput,
  prependManualSearchOption,
  resolveCreatorShortVideoManualRowKey,
  type CreatorShortVideoManualAttrsDraft,
} from './creator-short-video-manual-attrs-utils';

const CREATOR_SHORT_VIDEO_MANUAL_ATTRS_ENDPOINT = '/dashboard/creator/short-video/manual-attrs';

interface UseCreatorShortVideoManualAttrsParams {
  messageApi: MessageInstance;
  reloadDetails: () => Promise<void>;
  detailRows: CreatorShortVideoDetailRow[];
}

interface UseCreatorShortVideoManualAttrsResult {
  manualAttrColumns: ColumnsType<CreatorShortVideoDetailRow>;
}

export function useCreatorShortVideoManualAttrs({
  messageApi,
  reloadDetails,
  detailRows,
}: UseCreatorShortVideoManualAttrsParams): UseCreatorShortVideoManualAttrsResult {
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [deletingRowKey, setDeletingRowKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreatorShortVideoManualAttrsDraft | null>(null);
  const [localCreatorTypeOptions, setLocalCreatorTypeOptions] = useState<string[]>([]);
  const [localMcnOptions, setLocalMcnOptions] = useState<string[]>([]);
  const [creatorTypeSearchValue, setCreatorTypeSearchValue] = useState('');
  const [mcnSearchValue, setMcnSearchValue] = useState('');
  const skipCreatorTypeBlurCommitRef = useRef(false);
  const skipMcnBlurCommitRef = useRef(false);

  const updateDraft = useCallback((patch: Partial<CreatorShortVideoManualAttrsDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const startEdit = useCallback((row: CreatorShortVideoDetailRow) => {
    setEditingRowKey(resolveCreatorShortVideoManualRowKey(row));
    setDraft(buildCreatorShortVideoManualDraft(row));
    setCreatorTypeSearchValue('');
    setMcnSearchValue('');
    skipCreatorTypeBlurCommitRef.current = false;
    skipMcnBlurCommitRef.current = false;
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRowKey(null);
    setDraft(null);
    setCreatorTypeSearchValue('');
    setMcnSearchValue('');
    skipCreatorTypeBlurCommitRef.current = false;
    skipMcnBlurCommitRef.current = false;
  }, []);

  const baseCreatorTypeOptions = useMemo(
    () => buildManualSelectOptions(CREATOR_TYPE_OPTIONS, [
      ...detailRows.map((row) => normalizeCreatorTypeValue(row.manual_creator_type)),
      ...localCreatorTypeOptions.map(normalizeCreatorTypeValue),
      normalizeCreatorTypeValue(draft?.creatorType),
    ]),
    [detailRows, draft?.creatorType, localCreatorTypeOptions]
  );

  const displayedCreatorTypeOptions = useMemo(
    () => prependManualSearchOption(baseCreatorTypeOptions, creatorTypeSearchValue, normalizeCreatorTypeInput),
    [baseCreatorTypeOptions, creatorTypeSearchValue]
  );

  const baseMcnOptions = useMemo(
    () => buildManualSelectOptions([], [
      ...detailRows.map((row) => row.manual_mcn),
      ...localMcnOptions,
      draft?.mcn,
    ]),
    [detailRows, draft?.mcn, localMcnOptions]
  );

  const displayedMcnOptions = useMemo(
    () => prependManualSearchOption(baseMcnOptions, mcnSearchValue),
    [baseMcnOptions, mcnSearchValue]
  );

  const handleCreatorTypeChange = useCallback(
    (value: string | null | undefined) => {
      const nextValue = normalizeCreatorTypeInput(value);
      skipCreatorTypeBlurCommitRef.current = true;
      setLocalCreatorTypeOptions((current) => appendManualOptionValue(current, nextValue));
      setCreatorTypeSearchValue('');
      updateDraft({ creatorType: nextValue });
    },
    [updateDraft]
  );

  const handleMcnChange = useCallback(
    (value: string | null | undefined) => {
      const nextValue = normalizeManualSelectInput(value);
      skipMcnBlurCommitRef.current = true;
      setLocalMcnOptions((current) => appendManualOptionValue(current, nextValue));
      setMcnSearchValue('');
      updateDraft({ mcn: nextValue });
    },
    [updateDraft]
  );

  const commitCreatorTypeSearchValue = useCallback((reason: 'blur' | 'enter' = 'blur') => {
    if (reason === 'blur' && skipCreatorTypeBlurCommitRef.current) {
      skipCreatorTypeBlurCommitRef.current = false;
      setCreatorTypeSearchValue('');
      return;
    }

    const hasTypedValue = Boolean(normalizeManualSelectInput(creatorTypeSearchValue));
    const nextValue = normalizeCreatorTypeInput(creatorTypeSearchValue);
    if (hasTypedValue && !nextValue) {
      messageApi.warning(CREATOR_TYPE_INPUT_REJECTED_MESSAGE);
      setCreatorTypeSearchValue('');
      return;
    }
    if (!nextValue) {
      return;
    }

    setLocalCreatorTypeOptions((current) => appendManualOptionValue(current, nextValue));
    setCreatorTypeSearchValue('');
    updateDraft({ creatorType: nextValue });
  }, [creatorTypeSearchValue, messageApi, updateDraft]);

  const commitMcnSearchValue = useCallback((reason: 'blur' | 'enter' = 'blur') => {
    if (reason === 'blur' && skipMcnBlurCommitRef.current) {
      skipMcnBlurCommitRef.current = false;
      setMcnSearchValue('');
      return;
    }

    const nextValue = normalizeManualSelectInput(mcnSearchValue);
    if (!nextValue) {
      return;
    }

    setLocalMcnOptions((current) => appendManualOptionValue(current, nextValue));
    setMcnSearchValue('');
    updateDraft({ mcn: nextValue });
  }, [mcnSearchValue, updateDraft]);

  const saveDraft = useCallback(
    async (row: CreatorShortVideoDetailRow) => {
      const rowKey = resolveCreatorShortVideoManualRowKey(row);
      if (!draft || editingRowKey !== rowKey || savingRowKey) {
        return;
      }

      if (isCreatorTypeInputRejected(creatorTypeSearchValue)) {
        messageApi.error(CREATOR_TYPE_INPUT_REJECTED_MESSAGE);
        return;
      }

      const nextDraft = {
        ...draft,
        creatorType: normalizeCreatorTypeInput(creatorTypeSearchValue) ?? draft.creatorType,
        mcn: normalizeManualSelectInput(mcnSearchValue) ?? draft.mcn,
      };
      const payload = buildCreatorShortVideoManualPayload(row, nextDraft);
      if (!payload) {
        messageApi.error('缺少达人抖音号或视频ID，无法保存达人+视频人工字段。');
        return;
      }

      setSavingRowKey(rowKey);
      try {
        const response = await request.put<CreatorShortVideoManualAttrsResponse>(
          CREATOR_SHORT_VIDEO_MANUAL_ATTRS_ENDPOINT,
          payload,
          {
            requestKey: `creator-shortvideo-manual-attrs-${rowKey}`,
          }
        );

        if (!response.ok) {
          throw new Error('人工字段保存响应异常');
        }

        messageApi.success('人工字段已保存');
        setEditingRowKey(null);
        setDraft(null);
        setCreatorTypeSearchValue('');
        setMcnSearchValue('');
        skipCreatorTypeBlurCommitRef.current = false;
        skipMcnBlurCommitRef.current = false;
        await reloadDetails();
      } catch (error) {
        messageApi.error(normalizeErrorMessage(error, '人工字段保存失败，请稍后重试。'));
      } finally {
        setSavingRowKey(null);
      }
    },
    [creatorTypeSearchValue, draft, editingRowKey, mcnSearchValue, messageApi, reloadDetails, savingRowKey]
  );

  const deleteManualAttrs = useCallback(
    async (row: CreatorShortVideoDetailRow) => {
      const rowKey = resolveCreatorShortVideoManualRowKey(row);
      if (savingRowKey || deletingRowKey) {
        return;
      }

      const payload = buildCreatorShortVideoManualDeletePayload(row);
      if (!payload) {
        messageApi.error('缺少达人抖音号或视频ID，无法删除达人+视频人工字段。');
        return;
      }

      setDeletingRowKey(rowKey);
      try {
        const response = await request.delete<CreatorShortVideoManualAttrsDeleteResponse>(
          CREATOR_SHORT_VIDEO_MANUAL_ATTRS_ENDPOINT,
          {
            data: payload,
            requestKey: `creator-shortvideo-manual-attrs-delete-${rowKey}`,
          }
        );

        if (!response.ok) {
          throw new Error('人工字段删除响应异常');
        }

        messageApi.success(response.deleted ? '人工字段已删除' : '人工字段已清空');
        if (editingRowKey === rowKey) {
          setEditingRowKey(null);
          setDraft(null);
        }
        await reloadDetails();
      } catch (error) {
        messageApi.error(normalizeErrorMessage(error, '人工字段删除失败，请稍后重试。'));
      } finally {
        setDeletingRowKey(null);
      }
    },
    [deletingRowKey, editingRowKey, messageApi, reloadDetails, savingRowKey]
  );

  const manualAttrColumns = useMemo<ColumnsType<CreatorShortVideoDetailRow>>(
    () =>
      buildCreatorShortVideoManualAttrColumns({
        editingRowKey,
        savingRowKey,
        deletingRowKey,
        draft,
        creatorTypeOptions: displayedCreatorTypeOptions,
        mcnOptions: displayedMcnOptions,
        creatorTypeSearchValue,
        mcnSearchValue,
        setCreatorTypeSearchValue,
        setMcnSearchValue,
        updateDraft,
        handleCreatorTypeChange,
        handleMcnChange,
        commitCreatorTypeSearchValue,
        commitMcnSearchValue,
        saveDraft,
        deleteManualAttrs,
        startEdit,
        cancelEdit,
      }),
    [
      cancelEdit,
      displayedCreatorTypeOptions,
      creatorTypeSearchValue,
      draft,
      editingRowKey,
      commitCreatorTypeSearchValue,
      commitMcnSearchValue,
      handleCreatorTypeChange,
      handleMcnChange,
      mcnSearchValue,
      displayedMcnOptions,
      deleteManualAttrs,
      saveDraft,
      savingRowKey,
      deletingRowKey,
      startEdit,
      updateDraft,
    ]
  );

  return {
    manualAttrColumns,
  };
}
