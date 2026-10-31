'use client';

import { Button, Input, InputNumber, confirmModal, type TableColumnsType } from '@lobehub/ui';
import type { ReactNode } from 'react';
import { formatCreatorCurrencyCell, formatCreatorIntegerCell } from './creator-formatters';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import styles from './creator-short-video-manual-attrs.module.css';
import { ManualTagSelect } from './creator-short-video-manual-attrs-select';
import {
  CREATOR_TYPE_LABEL_RENDER,
  CREATOR_TYPE_OPTION_RENDER,
  MCN_LABEL_RENDER,
  MCN_OPTION_RENDER,
  resolveManualTagClassName,
} from './creator-short-video-manual-attrs-tag-render';
import {
  formatManualUpdatedAt,
  hasCreatorShortVideoManualAttrs,
  normalizeCreatorTypeValue,
  normalizeEditableNumber,
  resolveCreatorShortVideoAuthorDouyinId,
  resolveCreatorShortVideoManualRowKey,
  trimToNullable,
  type CreatorShortVideoManualAttrsDraft,
  type ManualSelectOption,
  type ManualTagKind,
} from './creator-short-video-manual-attrs-utils';

interface BuildCreatorShortVideoManualAttrColumnsParams {
  editingRowKey: string | null;
  savingRowKey: string | null;
  deletingRowKey: string | null;
  draft: CreatorShortVideoManualAttrsDraft | null;
  creatorTypeOptions: ManualSelectOption[];
  mcnOptions: ManualSelectOption[];
  setCreatorTypeSearchValue: (value: string) => void;
  setMcnSearchValue: (value: string) => void;
  updateDraft: (patch: Partial<CreatorShortVideoManualAttrsDraft>) => void;
  handleCreatorTypeChange: (value: string | null | undefined) => void;
  handleMcnChange: (value: string | null | undefined) => void;
  commitCreatorTypeSearchValue: (reason?: 'blur' | 'enter') => void;
  commitMcnSearchValue: (reason?: 'blur' | 'enter') => void;
  saveDraft: (row: CreatorShortVideoDetailRow) => Promise<void>;
  deleteManualAttrs: (row: CreatorShortVideoDetailRow) => Promise<void>;
  startEdit: (row: CreatorShortVideoDetailRow) => void;
  cancelEdit: () => void;
}

function renderManualTagValue(value: string | null | undefined, kind: ManualTagKind): ReactNode {
  const normalized = kind === 'creatorType' ? normalizeCreatorTypeValue(value) : trimToNullable(value);
  if (!normalized) return '--';

  return <span className={resolveManualTagClassName(kind)}>{normalized}</span>;
}

function renderManualValue(primary: string, secondary?: string | null, cellClassName?: string) {
  return (
    <div className={[styles.manualAttrCell, cellClassName].filter(Boolean).join(' ')}>
      <span className={styles.manualAttrValue}>{primary}</span>
      {secondary ? <span className={styles.manualAttrMuted}>{secondary}</span> : null}
    </div>
  );
}

function renderManualFansValue(row: CreatorShortVideoDetailRow) {
  const updatedAt = formatManualUpdatedAt(row.manual_fans_count_updated_at);
  return renderManualValue(
    formatCreatorIntegerCell(row.manual_fans_count),
    updatedAt ? `更新 ${updatedAt}` : null,
    styles.manualAttrCellNumeric
  );
}

function renderManualFeeValue(row: CreatorShortVideoDetailRow) {
  const amount = normalizeEditableNumber(row.manual_creator_fee_amount);
  const note = trimToNullable(row.manual_creator_fee_note);
  const primary = amount === null ? note || '--' : formatCreatorCurrencyCell(amount);
  const secondary = note && primary !== note ? note : null;

  return renderManualValue(primary, secondary, styles.manualAttrCellNumeric);
}

export function buildCreatorShortVideoManualAttrColumns({
  editingRowKey,
  savingRowKey,
  deletingRowKey,
  draft,
  creatorTypeOptions,
  mcnOptions,
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
}: BuildCreatorShortVideoManualAttrColumnsParams): TableColumnsType<CreatorShortVideoDetailRow> {
  return [
    {
      title: '粉丝量',
      dataIndex: 'manual_fans_count',
      width: 132,
      align: 'right',
      render: (_value: number | null, row) => {
        const rowKey = resolveCreatorShortVideoManualRowKey(row);
        if (editingRowKey !== rowKey || !draft) {
          return renderManualFansValue(row);
        }

        return (
          <InputNumber
            className={styles.manualAttrNumberInput}
            size="small"
            controls={false}
            min={0}
            precision={0}
            placeholder="粉丝量"
            aria-label="粉丝量"
            value={draft.fansCount}
            onChange={(value) => updateDraft({ fansCount: normalizeEditableNumber(value) })}
          />
        );
      },
    },
    {
      title: '达人类型',
      dataIndex: 'manual_creator_type',
      width: 136,
      align: 'center',
      render: (_value: string | null, row) => {
        const rowKey = resolveCreatorShortVideoManualRowKey(row);
        if (editingRowKey !== rowKey || !draft) {
          return renderManualTagValue(row.manual_creator_type, 'creatorType');
        }

        return (
          <ManualTagSelect
            label="达人类型"
            placeholder="选已有标签，或直接输入新标签"
            optionRender={CREATOR_TYPE_OPTION_RENDER}
            labelRender={CREATOR_TYPE_LABEL_RENDER}
            options={creatorTypeOptions}
            value={draft.creatorType}
            onSearch={setCreatorTypeSearchValue}
            onChange={handleCreatorTypeChange}
            onCommitSearch={commitCreatorTypeSearchValue}
          />
        );
      },
    },
    {
      title: 'MCN',
      dataIndex: 'manual_mcn',
      width: 148,
      align: 'center',
      render: (_value: string | null, row) => {
        const rowKey = resolveCreatorShortVideoManualRowKey(row);
        if (editingRowKey !== rowKey || !draft) {
          return renderManualTagValue(row.manual_mcn, 'mcn');
        }

        return (
          <ManualTagSelect
            label="MCN"
            placeholder="选已有 MCN，或直接输入新机构"
            optionRender={MCN_OPTION_RENDER}
            labelRender={MCN_LABEL_RENDER}
            options={mcnOptions}
            value={draft.mcn}
            onSearch={setMcnSearchValue}
            onChange={handleMcnChange}
            onCommitSearch={commitMcnSearchValue}
          />
        );
      },
    },
    {
      title: '合作费用',
      dataIndex: 'manual_creator_fee_amount',
      width: 176,
      align: 'right',
      render: (_value: number | null, row) => {
        const rowKey = resolveCreatorShortVideoManualRowKey(row);
        if (editingRowKey !== rowKey || !draft) {
          return renderManualFeeValue(row);
        }

        return (
          <div className={styles.manualAttrEditStack}>
            <div className={styles.manualAttrFeeInputs}>
              <InputNumber
                className={styles.manualAttrNumberInput}
                size="small"
                controls={false}
                min={0}
                precision={2}
                placeholder="金额"
                aria-label="合作费用金额"
                value={draft.creatorFeeAmount}
                onChange={(value) => updateDraft({ creatorFeeAmount: normalizeEditableNumber(value) })}
              />
            </div>
            <Input
              className={styles.manualAttrNoteInput}
              size="small"
              allowClear
              placeholder="备注"
              aria-label="合作费用备注"
              value={draft.creatorFeeNote ?? ''}
              onChange={(event) => updateDraft({ creatorFeeNote: trimToNullable(event.target.value) })}
            />
          </div>
        );
      },
    },
    {
      title: '人工维护',
      key: 'manual_attrs_actions',
      width: 156,
      align: 'center',
      render: (_value: unknown, row) => {
        const rowKey = resolveCreatorShortVideoManualRowKey(row);
        const isEditing = editingRowKey === rowKey;
        const isSaving = savingRowKey === rowKey;
        const isDeleting = deletingRowKey === rowKey;
        const hasAuthorDouyinId = Boolean(resolveCreatorShortVideoAuthorDouyinId(row));
        const hasVideoId = Boolean(trimToNullable(row.video_id));
        const hasManualAttrs = hasCreatorShortVideoManualAttrs(row);
        const hasRequiredIdentity = hasAuthorDouyinId && hasVideoId;
        const canEdit = hasRequiredIdentity && row.manual_can_edit === true;
        const canDelete = hasRequiredIdentity && hasManualAttrs && row.manual_can_delete === true;
        const disabledReason = !hasRequiredIdentity
          ? '缺少达人抖音号或视频ID，无法维护达人+视频字段'
          : canEdit
            ? undefined
            : '当前账号不是该短视频负责人，无法维护人工字段';
        const deleteDisabledReason = !hasRequiredIdentity
          ? '缺少达人抖音号或视频ID，无法删除达人+视频字段'
          : canDelete
            ? undefined
            : '当前账号不是该短视频负责人，无法删除人工字段';

        if (!isEditing) {
          return (
            <div className={styles.manualAttrActions}>
              <Button
                type="link"
                size="small"
                className={styles.manualAttrActionButton}
                disabled={Boolean(editingRowKey) || Boolean(savingRowKey) || Boolean(deletingRowKey) || !canEdit}
                title={disabledReason}
                onClick={() => startEdit(row)}
              >
                编辑
              </Button>
              {hasManualAttrs ? (
                <Button
                  danger
                  type="link"
                  size="small"
                  className={styles.manualAttrActionButton}
                  loading={isDeleting}
                  disabled={Boolean(editingRowKey) || Boolean(savingRowKey) || Boolean(deletingRowKey) || !canDelete}
                  title={deleteDisabledReason}
                  onClick={() =>
                    confirmModal({
                      title: '删除人工字段',
                      content: '仅删除粉丝量、达人类型、MCN、费用等人工维护字段。',
                      okText: '删除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => deleteManualAttrs(row),
                    })
                  }
                >
                  删除
                </Button>
              ) : null}
            </div>
          );
        }

        return (
          <div className={styles.manualAttrActions}>
            <Button
              type="link"
              size="small"
              className={styles.manualAttrActionButton}
              loading={isSaving}
              onClick={() => void saveDraft(row)}
            >
              保存
            </Button>
            <Button
              type="link"
              size="small"
              className={styles.manualAttrActionButton}
              disabled={isSaving}
              onClick={cancelEdit}
            >
              取消
            </Button>
          </div>
        );
      },
    },
  ];
}
