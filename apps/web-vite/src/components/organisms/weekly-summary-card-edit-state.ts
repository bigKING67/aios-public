'use client';

import { useState } from 'react';
import { App } from 'antd';
import type { UseMutateFunction } from '@tanstack/react-query';
import type {
  APIErrorLike,
  SummaryContentResponse,
  SummaryData,
  UpdateSummaryVariables,
} from '@/hooks/weekly-summary-model';
import { normalizeLines } from './weekly-summary-card-model';
import type { WeeklySummaryEditModalProps } from './weekly-summary-edit-modal';

type UpdateSummaryMutate = UseMutateFunction<
  SummaryContentResponse,
  APIErrorLike,
  UpdateSummaryVariables,
  unknown
>;

export interface UseWeeklySummaryCardEditStateArgs {
  data: SummaryData | undefined;
  updateSummary: UpdateSummaryMutate;
  confirmLoading: boolean;
}

export function useWeeklySummaryCardEditState({
  data,
  updateSummary,
  confirmLoading,
}: UseWeeklySummaryCardEditStateArgs) {
  const { modal } = App.useApp();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editOverall, setEditOverall] = useState('');
  const [editHighlightsText, setEditHighlightsText] = useState('');
  const [editRisksText, setEditRisksText] = useState('');
  const [editErrorText, setEditErrorText] = useState<string | null>(null);

  const openEditModal = () => {
    const conclusions = data?.conclusions;
    setEditOverall(conclusions?.overall || '');
    setEditHighlightsText((conclusions?.highlights || []).join('\n'));
    setEditRisksText((conclusions?.risks || []).join('\n'));
    setEditErrorText(null);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedSummary = () => {
    const overall = editOverall.trim();
    if (!overall) {
      setEditErrorText('总体概况不能为空');
      return;
    }

    const nextConclusions = {
      overall,
      highlights: normalizeLines(editHighlightsText),
      risks: normalizeLines(editRisksText),
    };

    setEditErrorText(null);
    modal.confirm({
      title: '确认提交总结更新？',
      content: '保存后会写入数据库，并作为当前页最新总结展示。',
      okText: '确认提交',
      cancelText: '取消',
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          updateSummary(
            {
              conclusions: nextConclusions,
            },
            {
              onSuccess: () => {
                setIsEditModalOpen(false);
                resolve();
              },
              onError: (error) => {
                reject(error);
              },
            }
          );
        }),
    });
  };

  const editModalProps: WeeklySummaryEditModalProps = {
    open: isEditModalOpen,
    confirmLoading,
    editOverall,
    editHighlightsText,
    editRisksText,
    errorText: editErrorText,
    onCancel: () => setIsEditModalOpen(false),
    onSave: handleSaveEditedSummary,
    setEditOverall,
    setEditHighlightsText,
    setEditRisksText,
  };

  return {
    openEditModal,
    editModalProps,
  };
}
