'use client';

import { Button, DropdownMenu, type DropdownItem } from '@lobehub/ui';
import { ChevronDown, Download, LogIn } from 'lucide-react';
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
      icon={<Download size={14} strokeWidth={1.8} aria-hidden="true" />}
      loading={exportLoading}
      onClick={hasExportMenu ? undefined : () => void onExport()}
      disabled={exportDisabled}
      title={exportButtonTitle}
    >
      {exportButtonLabel}
      {hasExportMenu ? <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" /> : null}
    </Button>
  );
  const exportMenuItemsForMenu: DropdownItem[] | undefined = hasExportMenu
    ? exportMenuItems?.map((item) => ({
        key: item.key,
        label: item.label,
        title: item.title,
        disabled: exportLoading || item.disabled,
        onClick: () => {
          if (exportLoading || item.disabled) {
            return;
          }
          void item.onClick();
        },
      }))
    : undefined;

  return (
    <div className={styles.detailActions}>
      {hasExportMenu && exportMenuItemsForMenu ? (
        <DropdownMenu
          items={exportMenuItemsForMenu}
          trigger="both"
          placement="bottomRight"
          disabled={exportDisabled || exportLoading}
        >
          {exportButton}
        </DropdownMenu>
      ) : (
        exportButton
      )}
      {!isAuthenticated ? (
        <div className={styles.exportHintWrap}>
          <p className={styles.exportHint}>未登录不可下载明细</p>
          <Button
            type="link"
            size="small"
            icon={<LogIn size={14} strokeWidth={1.8} aria-hidden="true" />}
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
