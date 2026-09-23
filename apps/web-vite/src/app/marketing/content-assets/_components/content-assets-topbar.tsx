import { Button, Input, Select } from 'antd';
import {
  CloudUploadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import {
  CONTENT_ASSETS_NAV_OPTIONS,
  type ContentAssetsModuleKey,
} from './content-assets-module-nav-config';
import styles from './content-assets-controls.module.css';

export function ContentAssetsTopbar({
  activeModule,
  keywordInput,
  canWrite,
  onModuleChange,
  onKeywordInputChange,
  onSearch,
  onUploadOpen,
}: {
  activeModule: ContentAssetsModuleKey;
  keywordInput: string;
  canWrite: boolean;
  onModuleChange: (module: ContentAssetsModuleKey) => void;
  onKeywordInputChange: (value: string) => void;
  onSearch: () => void;
  onUploadOpen: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const displayName = user?.full_name || user?.username || 'Six';
  const initials = displayName.trim().slice(0, 2).toUpperCase() || '67';
  const roleLabel = user?.roles?.[0] || '素材管理员';

  return (
    <header className={styles.topBar}>
      <Select<ContentAssetsModuleKey>
        className={styles.moduleSwitcher}
        value={activeModule}
        options={CONTENT_ASSETS_NAV_OPTIONS}
        aria-label="切换素材库模块"
        onChange={onModuleChange}
      />
      <Input
        allowClear
        className={styles.globalSearch}
        prefix={<SearchOutlined />}
        suffix={(
          <button className={styles.searchSubmitButton} type="button" onClick={onSearch}>
            搜索
          </button>
        )}
        placeholder="搜索"
        value={keywordInput}
        onChange={(event) => onKeywordInputChange(event.target.value)}
        onPressEnter={onSearch}
      />
      <div className={styles.topActions}>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          disabled={!canWrite}
          onClick={onUploadOpen}
        >
          上传素材
        </Button>
        <div className={styles.avatarIdentity} aria-label={`当前用户：${displayName}`}>
          <span className={styles.avatarInitial}>
            {initials}
          </span>
          <div className={styles.avatarMeta}>
            <strong>{displayName}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
