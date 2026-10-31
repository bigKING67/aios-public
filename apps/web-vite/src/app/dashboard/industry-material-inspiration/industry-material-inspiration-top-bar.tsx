import { Button, DayjsDatePicker, datePickerLocaleZhCN } from '@lobehub/ui';
import type { Dayjs } from 'dayjs';
import { House, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { useDashboardPlatformThumb } from '../_components/dashboard-platform-thumb-motion';
import dashboardTabButtonStyles from '../_components/dashboard-filter-header-tab-button.module.css';
import dashboardTabRailStyles from '../_components/dashboard-filter-header-tabs.module.css';
import {
  ALL_BRANDS_KEY,
  buildBrandFilterOptions,
  TAB_ITEMS,
} from './industry-material-inspiration-client-helpers';
import type { IndustryMaterialTab } from './industry-material-inspiration-types';
import styles from './industry-material-inspiration.module.css';

interface IndustryMaterialTopBarProps {
  activeTab: IndustryMaterialTab;
  month: string | null;
  selectedBrandKey: string;
  isDouyinTab: boolean;
  brandFilterOptions: ReturnType<typeof buildBrandFilterOptions>;
  isFetching: boolean;
  hasTableRows: boolean;
  brandOptionCount: number;
  monthValue: Dayjs;
  disableUnavailableMonth: (current: Dayjs) => boolean;
  onCommitControls: (
    nextTab: IndustryMaterialTab,
    nextMonth: string | null,
    nextBrandKey?: string
  ) => void;
  onRefresh: () => void;
}

export function IndustryMaterialTopBar({
  activeTab,
  month,
  selectedBrandKey,
  isDouyinTab,
  brandFilterOptions,
  isFetching,
  hasTableRows,
  brandOptionCount,
  monthValue,
  disableUnavailableMonth,
  onCommitControls,
  onRefresh,
}: IndustryMaterialTopBarProps) {
  const {
    platformRailRef,
    platformThumbRef,
    platformRailStyle,
    registerPlatformButton,
    isPlatformThumbReady,
  } = useDashboardPlatformThumb({
    activeTab,
    visibleTabs: TAB_ITEMS,
  });
  const platformRailClassName = [
    styles.tabRailHost,
    dashboardTabRailStyles.tabRail,
    isPlatformThumbReady ? dashboardTabRailStyles.tabRailMotionReady : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={styles.topBarDock}>
      <div className={styles.topBar}>
        <div className={styles.brandBlock}>
          <Link to="/" className={styles.homeEntryLink} aria-label="返回首页" title="返回首页">
            <House className={styles.homeEntryIcon} size="1em" strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <div className={styles.brand}>Groland Intelligence</div>
        </div>

        <nav
          ref={platformRailRef}
          className={platformRailClassName}
          style={platformRailStyle}
          aria-label="行业素材灵感内容类型"
        >
          <span ref={platformThumbRef} className={dashboardTabRailStyles.tabRailThumb} aria-hidden="true" />
          {TAB_ITEMS.map((item) => {
            const isActive = item.key === activeTab;
            return (
              <button
                key={item.key}
                ref={registerPlatformButton(item.key)}
                type="button"
                className={[
                  dashboardTabButtonStyles.tabButton,
                  isActive ? dashboardTabButtonStyles.tabButtonActive : undefined,
                  isActive && isPlatformThumbReady
                    ? dashboardTabButtonStyles.tabButtonActiveWithThumb
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onCommitControls(item.key, month, selectedBrandKey)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className={styles.controlPanel} aria-label="行业素材灵感筛选">
          <div className={styles.brandPickerShell}>
            <LabeledSelect<string>
              label="品牌筛选"
              showSearch
              value={isDouyinTab ? selectedBrandKey : ALL_BRANDS_KEY}
              options={brandFilterOptions}
              wrapperClassName={styles.brandSelect}
              disabled={!isDouyinTab || (isFetching && !hasTableRows && brandOptionCount === 0)}
              onChange={(nextBrandKey) => {
                if (nextBrandKey !== undefined) {
                  onCommitControls(activeTab, month, nextBrandKey);
                }
              }}
            />
          </div>
          <div className={styles.pickerShell}>
            <DayjsDatePicker
              picker="month"
              allowClear={false}
              value={monthValue}
              locale={datePickerLocaleZhCN}
              disabledDate={disableUnavailableMonth}
              format="YYYY/MM"
              className={styles.monthPicker}
              onChange={(value) => {
                const nextMonth = value?.format('YYYY-MM');
                if (nextMonth) {
                  onCommitControls(activeTab, nextMonth, selectedBrandKey);
                }
              }}
            />
          </div>
          <Button
            className={styles.refreshButton}
            icon={<RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />}
            loading={isDouyinTab && isFetching}
            disabled={!isDouyinTab}
            onClick={onRefresh}
          >
            刷新
          </Button>
        </div>
      </div>
    </header>
  );
}
