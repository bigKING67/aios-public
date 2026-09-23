'use client';

import { Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import styles from './creator-dashboard.module.css';
import { DATE_MODE_OPTIONS, type DateMode } from './creator-date-range';
import { CREATOR_DASHBOARD_TABS, type CreatorDashboardTabKey } from './creator-tabs';
import { CreatorDateModePicker, type CreatorDateModePickerProps } from './creator-date-mode-picker';

export interface CreatorDashboardTopBarProps {
  activeTab: CreatorDashboardTabKey;
  onDateModeChange: (value: DateMode) => void;
  segmentedName: string;
  datePickerProps: CreatorDateModePickerProps;
}

export function CreatorDashboardTopBar({
  activeTab,
  onDateModeChange,
  segmentedName,
  datePickerProps,
}: CreatorDashboardTopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.brandBlock}>
        <Link
          to="/"
          className={styles.homeEntryLink}
          aria-label="返回首页"
          title="返回首页"
        >
          <HomeOutlined className={styles.homeEntryIcon} />
        </Link>
        <div className={styles.brand}>Groland Shopping Influencer</div>
      </div>

      <nav className={styles.tabRail} aria-label="带货达人看板页面切换">
        {CREATOR_DASHBOARD_TABS.map((tab) => {
          const className =
            tab.key === activeTab
              ? `${styles.tabButton} ${styles.tabButtonActive}`
              : styles.tabButton;
          return (
            <Link key={tab.key} to={tab.href} className={className}>
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.filters}>
        <Segmented<DateMode>
          name={segmentedName}
          value={datePickerProps.dateMode}
          onChange={onDateModeChange}
          options={DATE_MODE_OPTIONS.map((item) => ({ label: item.label, value: item.key }))}
        />
        <div className={styles.pickerShell} aria-label="时间选择">
          <CreatorDateModePicker {...datePickerProps} />
        </div>
      </div>
    </header>
  );
}
