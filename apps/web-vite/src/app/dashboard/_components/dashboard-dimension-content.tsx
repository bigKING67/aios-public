import type { ReactNode } from 'react';
import { BarChartOutlined } from '@ant-design/icons';

import {
  DASHBOARD_DIMENSION_PLACEHOLDER_COPY,
  type DashboardDimension,
} from './dashboard-config';
import layoutStyles from './dashboard-dimension-content.module.css';
import navStyles from './dashboard-dimension-nav.module.css';
import placeholderContentStyles from './dashboard-dimension-placeholder-content.module.css';
import placeholderStyles from './dashboard-dimension-placeholder.module.css';

export type DashboardDimensionContentKind =
  | 'business'
  | 'goods'
  | 'traffic'
  | 'live'
  | 'shortVideo'
  | 'goodsCard'
  | 'qianchuan'
  | 'placeholder';

export type DashboardDimensionNavItem = {
  key: DashboardDimension;
  label: string;
  subtitle: string;
};

export type DashboardDimensionContentProps = {
  isOverviewTab: boolean;
  activeDimension: DashboardDimension;
  effectiveDimension: DashboardDimension;
  activeDimensionItems: DashboardDimensionNavItem[];
  contentKind: DashboardDimensionContentKind;
  dimensionContent: ReactNode;
  onDimensionChange: (dimension: DashboardDimension) => void;
};

function PlaceholderDimensionContent({
  effectiveDimension,
}: {
  effectiveDimension: DashboardDimension;
}) {
  const placeholderCopy =
    DASHBOARD_DIMENSION_PLACEHOLDER_COPY[
      effectiveDimension as Exclude<DashboardDimension, 'business'>
    ];

  return (
    <section className={placeholderStyles.dimensionPlaceholderPanel}>
      <div className={placeholderStyles.dimensionPlaceholderHeader}>
        <h3 className={placeholderContentStyles.dimensionPlaceholderTitle}>
          {placeholderCopy.title}
        </h3>
        <p className={placeholderContentStyles.dimensionPlaceholderDescription}>
          {placeholderCopy.description}
        </p>
      </div>
      <div className={placeholderStyles.dimensionPlaceholderGrid}>
        <article className={placeholderContentStyles.dimensionPlaceholderCard}>
          <span className={placeholderContentStyles.dimensionPlaceholderCardLabel}>
            顶部筛选已生效
          </span>
          <strong className={placeholderContentStyles.dimensionPlaceholderCardValue}>
            平台 + 时间会直接作用到后续数据
          </strong>
        </article>
        <article className={placeholderContentStyles.dimensionPlaceholderCard}>
          <span className={placeholderContentStyles.dimensionPlaceholderCardLabel}>
            当前状态
          </span>
          <strong className={placeholderContentStyles.dimensionPlaceholderCardValue}>
            已完成导航与布局接入，等待数据接口
          </strong>
        </article>
        <article className={placeholderContentStyles.dimensionPlaceholderCard}>
          <span className={placeholderContentStyles.dimensionPlaceholderCardLabel}>
            下阶段
          </span>
          <strong className={placeholderContentStyles.dimensionPlaceholderCardValue}>
            {placeholderCopy.nextStep}
          </strong>
        </article>
      </div>
    </section>
  );
}

export function DashboardDimensionContent({
  isOverviewTab,
  activeDimension,
  effectiveDimension,
  activeDimensionItems,
  contentKind,
  dimensionContent,
  onDimensionChange,
}: DashboardDimensionContentProps) {
  if (isOverviewTab) {
    return <div className={layoutStyles.dashboardContent}>{dimensionContent}</div>;
  }

  const content = contentKind === 'placeholder'
    ? <PlaceholderDimensionContent effectiveDimension={effectiveDimension} />
    : dimensionContent;

  return (
    <div className={layoutStyles.dashboardShell}>
      <aside className={navStyles.dimensionSidebar} aria-label="板块导航">
        <div className={navStyles.dimensionSidebarHead}>
          <div className={navStyles.dimensionTitleLine}>
            <BarChartOutlined className={navStyles.dimensionTitleIcon} />
            <h2>维度</h2>
          </div>
        </div>
        <nav className={navStyles.dimensionNav} aria-label="维度切换">
          {activeDimensionItems.map((item) => {
            const isActive = item.key === activeDimension;
            return (
              <button
                key={item.key}
                type="button"
                className={`${navStyles.dimensionButton}${isActive ? ` ${navStyles.dimensionButtonActive}` : ''}`}
                onClick={() => onDimensionChange(item.key)}
              >
                <span className={navStyles.dimensionButtonLabel}>{item.label}</span>
                <span className={navStyles.dimensionButtonHint}>{item.subtitle}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className={layoutStyles.dashboardContent}>
        <section className={navStyles.dimensionMobileRail} aria-label="移动端维度导航">
          <span className={navStyles.dimensionMobileTitle}>维度</span>
          <nav className={navStyles.dimensionMobileNav} aria-label="维度切换">
            {activeDimensionItems.map((item) => {
              const isActive = item.key === activeDimension;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${navStyles.dimensionMobileButton}${
                    isActive ? ` ${navStyles.dimensionMobileButtonActive}` : ''
                  }`}
                  onClick={() => onDimensionChange(item.key)}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </section>

        {content}
      </div>
    </div>
  );
}
