import { Modal } from '@lobehub/ui';
import { useEffect } from 'react';
import { FormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { bindSelectField, type ControlledFormRules, useControlledForm } from '@/hooks/use-controlled-form';
import type {
  CreatorLibraryFilterOptions,
  CreatorLibraryItem,
  CreatorLibraryPayload,
} from '../_lib/creator-library-types';
import {
  formValuesToPayload,
  itemToFormValues,
  withCreatorUpdateVersion,
} from '../_lib/creator-library-form';

interface AssignValues {
  ownerUserId?: string;
}

const ASSIGN_RULES: ControlledFormRules<AssignValues> = {
  ownerUserId: [{ required: true, message: '请选择归属BD' }],
};

interface BdUserOption {
  label: string;
  value: string;
  searchText: string;
  displayName: string;
}

interface CreatorLibraryAssignBdModalProps {
  item: CreatorLibraryItem | null;
  open: boolean;
  saving?: boolean;
  filterOptions: CreatorLibraryFilterOptions;
  onSubmit: (payload: CreatorLibraryPayload) => void;
  onCancel: () => void;
}

export function CreatorLibraryAssignBdModal({
  item,
  open,
  saving,
  filterOptions,
  onSubmit,
  onCancel,
}: CreatorLibraryAssignBdModalProps) {
  const bdUserOptions = buildBdUserOptions(filterOptions, item);
  const hasAssignableOptions = bdUserOptions.length > 0;
  const form = useControlledForm<AssignValues>({
    initialValues: { ownerUserId: item?.ownerUserId || undefined },
    rules: ASSIGN_RULES,
    onFinish: (values) => {
      if (!item) {
        return;
      }
      const selectedOption = bdUserOptions.find((option) => option.value === values.ownerUserId);
      if (!selectedOption) {
        return;
      }
      onSubmit(
        withCreatorUpdateVersion(
          {
            ...formValuesToPayload(itemToFormValues(item)),
            owner_name: selectedOption.displayName,
            owner_user_id: selectedOption.value,
          },
          item
        )
      );
    },
  });

  // Each opening starts from the creator's current owner.
  useEffect(() => {
    if (open) form.resetFields();
  }, [form, item, open]);

  return (
    <Modal
      title={item ? `分配BD：${item.influencerName}` : '分配BD'}
      open={open}
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      <FormField form={form} name="ownerUserId" label="归属BD" required>
        <LabeledSelect
          {...bindSelectField(form, 'ownerUserId')}
          showSearch
          allowClear
          disabled={!hasAssignableOptions}
          placeholder={hasAssignableOptions ? '选择负责BD' : '请先初始化BD账号'}
          options={bdUserOptions}
        />
      </FormField>
    </Modal>
  );
}

function buildBdUserOptions(
  filterOptions: CreatorLibraryFilterOptions,
  item: CreatorLibraryItem | null
): BdUserOption[] {
  const options = filterOptions.bdUsers.map((user) => {
    const displayName = user.displayName || user.username || user.userId;
    return {
      label: displayName,
      value: user.userId,
      searchText: [displayName, user.username, user.userId, ...user.aliases]
        .filter(Boolean)
        .join(' '),
      displayName,
    };
  });
  if (item?.ownerUserId && !options.some((option) => option.value === item.ownerUserId)) {
    options.push({
      label: item.ownerName || item.ownerUserId,
      value: item.ownerUserId,
      searchText: [item.ownerName, item.ownerUserId].filter(Boolean).join(' '),
      displayName: item.ownerName || item.ownerUserId,
    });
  }
  return options;
}
