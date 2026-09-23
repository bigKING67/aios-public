import { Form, Modal, Select } from 'antd';
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
  const [form] = Form.useForm<AssignValues>();
  const bdUserOptions = buildBdUserOptions(filterOptions, item);
  const hasAssignableOptions = bdUserOptions.length > 0;

  return (
    <Modal
      title={item ? `分配BD：${item.influencerName}` : '分配BD'}
      open={open}
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form<AssignValues>
        form={form}
        layout="vertical"
        initialValues={{
          ownerUserId: item?.ownerUserId || undefined,
        }}
        onFinish={(values) => {
          if (!item) {
            return;
          }
          const selectedOption = bdUserOptions.find(
            (option) => option.value === values.ownerUserId
          );
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
        }}
      >
        <Form.Item
          name="ownerUserId"
          label="归属BD"
          rules={[{ required: true, message: '请选择归属BD' }]}
        >
          <Select
            showSearch
            allowClear
            disabled={!hasAssignableOptions}
            placeholder={hasAssignableOptions ? '选择负责BD' : '请先初始化BD账号'}
            optionFilterProp="searchText"
            filterOption={filterSelectOption}
            options={bdUserOptions}
          />
        </Form.Item>
      </Form>
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

function filterSelectOption(
  inputValue: string,
  option?: { value?: string | number | null; searchText?: string }
) {
  const keyword = inputValue.toLowerCase();
  const searchText = String(option?.searchText ?? option?.value ?? '').toLowerCase();
  return searchText.includes(keyword);
}
