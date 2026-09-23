'use client';

import { DownOutlined, DownloadOutlined, LoginOutlined } from '@ant-design/icons';
import { Button, Dropdown, type MenuProps } from 'antd';
import styles from './creator-live-dashboard.module.css';

export interface CreatorDetailExportMenuItem {
  key: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}

interface CreatorDetailExportActionsProps {
  exportLoading: boolean;
  exportDisabled: boolean;
  exportButtonLabel?: string;
  exportButtonTitle?: string;
  exportMenuItems?: readonly CreatorDetailExportMenuItem[];
  onExport: () => void | Promise<void>;
  isAuthenticated: boolean;
  onNavigateToLogin: () => void;
}

export function CreatorDetailExportActions({
  exportLoading,
  exportDisabled,
  exportButtonLabel = '导出明细',
  exportButtonTitle,
  exportMenuItems,
  onExport,
  isAuthenticated,
  onNavigateToLogin,
}: CreatorDetailExportActionsProps) {
  const hasExportMenu = Boolean(exportMenuItems?.length);
  const exportButton = (
    <Button
      type="primary"
      icon={<DownloadOutlined />}
      loading={exportLoading}
      onClick={hasExportMenu ? undefined : () => void onExport()}
      disabled={exportDisabled}
      title={exportButtonTitle}
    >
      {exportButtonLabel}
      {hasExportMenu ? <DownOutlined /> : null}
    </Button>
  );
  const exportMenu: MenuProps | undefined = hasExportMenu
    ? {
        items: exportMenuItems?.map((item) => ({
          key: item.key,
          label: item.label,
          title: item.title,
          disabled: exportLoading || item.disabled,
        })),
        onClick: ({ key }) => {
          const item = exportMenuItems?.find((candidate) => candidate.key === key);
          if (!item || exportLoading || item.disabled) {
            return;
          }
          void item.onClick();
        },
      }
    : undefined;

  return (
    <div className={styles.detailActions}>
      {hasExportMenu && exportMenu ? (
        <Dropdown
          menu={exportMenu}
          trigger={['hover', 'click']}
          placement="bottomRight"
          disabled={exportDisabled || exportLoading}
        >
          {exportButton}
        </Dropdown>
      ) : (
        exportButton
      )}
      {!isAuthenticated ? (
        <div className={styles.exportHintWrap}>
          <p className={styles.exportHint}>未登录不可下载明细</p>
          <Button
            type="link"
            size="small"
            icon={<LoginOutlined />}
            className={styles.loginEntryButton}
            onClick={onNavigateToLogin}
          >
            去登录后导出
          </Button>
        </div>
      ) : null}
    </div>
  );
}
