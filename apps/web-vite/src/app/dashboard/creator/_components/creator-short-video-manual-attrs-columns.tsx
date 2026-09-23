'use client';

import { Button, Input, InputNumber, Popconfirm, Select, Space, type SelectProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { KeyboardEvent, ReactNode } from 'react';
import { formatCreatorCurrencyCell, formatCreatorIntegerCell } from './creator-formatters';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import styles from './creator-short-video-manual-attrs.module.css';
import {
  filterManualSelectOption,
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

type ManualSelectProps = SelectProps<string, ManualSelectOption>;

interface BuildCreatorShortVideoManualAttrColumnsParams {
  editingRowKey: string | null;
  savingRowKey: string | null;
  deletingRowKey: string | null;
  draft: CreatorShortVideoManualAttrsDraft | null;
  creatorTypeOptions: ManualSelectOption[];
  mcnOptions: ManualSelectOption[];
  creatorTypeSearchValue: string;
  mcnSearchValue: string;
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

const MANUAL_SELECT_POPUP_CLASS_NAME = styles.manualAttrSelectPopup;

function resolveManualTagClassName(kind: ManualTagKind): string {
  const toneClassName = kind === 'creatorType' ? styles.manualAttrTagCreatorType : styles.manualAttrTagMcn;

  return [styles.manualAttrTag, toneClassName].filter(Boolean).join(' ');
}

function renderManualTagValue(value: string | null | undefined, kind: ManualTagKind): ReactNode {
  const normalized = kind === 'creatorType' ? normalizeCreatorTypeValue(value) : trimToNullable(value);
  if (!normalized) return '--';

  return <span className={resolveManualTagClassName(kind)}>{normalized}</span>;
}

function resolveManualTagLabel(label: ReactNode, value: string): string {
  if (typeof label === 'string' || typeof label === 'number') return String(label);

  return value;
}

function createManualLabelRender(kind: ManualTagKind): NonNullable<ManualSelectProps['labelRender']> {
  return function manualLabelRender({ label, value }) {
    const labelText = resolveManualTagLabel(label, String(value ?? ''));
    if (!labelText) return null;

    return <span className={resolveManualTagClassName(kind)}>{labelText}</span>;
  };
}

function createManualOptionRender(kind: ManualTagKind): NonNullable<ManualSelectProps['optionRender']> {
  return function manualOptionRender(option) {
    const value = String(option.value ?? option.data.value ?? '');
    const labelText = resolveManualTagLabel(option.label ?? option.data.label, value);

    return (
      <span className={styles.manualAttrOption}>
        <span className={resolveManualTagClassName(kind)}>{labelText}</span>
        {option.data.isInput ? (
          <span className={styles.manualAttrOptionHint}>
            {kind === 'creatorType' ? '新增标签' : '新增 MCN'}
          </span>
        ) : null}
      </span>
    );
  };
}

const CREATOR_TYPE_LABEL_RENDER = createManualLabelRender('creatorType');
const MCN_LABEL_RENDER = createManualLabelRender('mcn');
const CREATOR_TYPE_OPTION_RENDER = createManualOptionRender('creatorType');
const MCN_OPTION_RENDER = createManualOptionRender('mcn');

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

function isComposingEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229);
}

export function buildCreatorShortVideoManualAttrColumns({
  editingRowKey,
  savingRowKey,
  deletingRowKey,
  draft,
  creatorTypeOptions,
  mcnOptions,
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
}: BuildCreatorShortVideoManualAttrColumnsParams): ColumnsType<CreatorShortVideoDetailRow> {
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
          <Select
            className={[styles.manualAttrSelect, styles.manualAttrTagSelect].join(' ')}
            size="small"
            allowClear
            showSearch
            placeholder="选已有标签，或直接输入新标签"
            popupClassName={MANUAL_SELECT_POPUP_CLASS_NAME}
            optionFilterProp="value"
            filterOption={filterManualSelectOption}
            optionRender={CREATOR_TYPE_OPTION_RENDER}
            labelRender={CREATOR_TYPE_LABEL_RENDER}
            notFoundContent={<span className={styles.manualAttrEmptyHint}>没有匹配项，输入后按 Enter 作为新标签</span>}
            options={creatorTypeOptions}
            searchValue={creatorTypeSearchValue}
            value={draft.creatorType ?? undefined}
            onSearch={setCreatorTypeSearchValue}
            onChange={handleCreatorTypeChange}
            onClear={() => handleCreatorTypeChange(null)}
            onBlur={() => commitCreatorTypeSearchValue('blur')}
            onInputKeyDown={(event) => {
              if (event.key === 'Enter' && !isComposingEnter(event)) {
                commitCreatorTypeSearchValue('enter');
              }
            }}
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
          <Select
            className={[styles.manualAttrSelect, styles.manualAttrTagSelect].join(' ')}
            size="small"
            allowClear
            showSearch
            placeholder="选已有 MCN，或直接输入新机构"
            popupClassName={MANUAL_SELECT_POPUP_CLASS_NAME}
            optionFilterProp="value"
            filterOption={filterManualSelectOption}
            optionRender={MCN_OPTION_RENDER}
            labelRender={MCN_LABEL_RENDER}
            notFoundContent={<span className={styles.manualAttrEmptyHint}>没有匹配项，输入后按 Enter 作为新 MCN</span>}
            options={mcnOptions}
            searchValue={mcnSearchValue}
            value={draft.mcn ?? undefined}
            onSearch={setMcnSearchValue}
            onChange={handleMcnChange}
            onClear={() => handleMcnChange(null)}
            onBlur={() => commitMcnSearchValue('blur')}
            onInputKeyDown={(event) => {
              if (event.key === 'Enter' && !isComposingEnter(event)) {
                commitMcnSearchValue('enter');
              }
            }}
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
          <Space direction="vertical" size={4} className={styles.manualAttrEditStack}>
            <div className={styles.manualAttrFeeInputs}>
              <InputNumber
                className={styles.manualAttrNumberInput}
                size="small"
                controls={false}
                min={0}
                precision={2}
                placeholder="金额"
                value={draft.creatorFeeAmount}
                onChange={(value) => updateDraft({ creatorFeeAmount: normalizeEditableNumber(value) })}
              />
            </div>
            <Input
              className={styles.manualAttrNoteInput}
              size="small"
              allowClear
              placeholder="备注"
              value={draft.creatorFeeNote ?? ''}
              onChange={(event) => updateDraft({ creatorFeeNote: trimToNullable(event.target.value) })}
            />
          </Space>
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
            <Space size={4} className={styles.manualAttrActions}>
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
                <Popconfirm
                  title="删除人工字段"
                  description="仅删除粉丝量、达人类型、MCN、费用等人工维护字段。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={Boolean(editingRowKey) || Boolean(savingRowKey) || Boolean(deletingRowKey) || !canDelete}
                  onConfirm={() => void deleteManualAttrs(row)}
                >
                  <Button
                    danger
                    type="link"
                    size="small"
                    className={styles.manualAttrActionButton}
                    loading={isDeleting}
                    disabled={Boolean(editingRowKey) || Boolean(savingRowKey) || Boolean(deletingRowKey) || !canDelete}
                    title={deleteDisabledReason}
                  >
                    删除
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          );
        }

        return (
          <Space size={4} className={styles.manualAttrActions}>
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
          </Space>
        );
      },
    },
  ];
}
