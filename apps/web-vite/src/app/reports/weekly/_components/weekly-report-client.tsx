'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'antd';
import { useFilter } from '@/hooks/use-filter';
import { useInitialWeekPeriod } from '@/hooks/use-initial-week-period';
import { useIsMobile } from '@/hooks/use-media-query';
import { useWeeklyReport } from '@/hooks/use-weekly-report';
import { ReportSkeleton } from '@/components/organisms/report-skeleton';
import { ErrorState } from '@/components/states/error-state';
import { resolveAllowedDashboardTabs, resolveDashboardTabKey } from '@/lib/role-access';
import { useAuthStore } from '@/stores/auth.store';
import { CompactHeader } from './compact-header';
import {
  WEEK_PERIOD_DEBOUNCE_MS,
  debounce,
  generateTabsFromReport,
  getWeeklyReportRequestError,
  normalizeQueryValue,
  type WeeklyReportClientProps,
} from './weekly-report-client-model';
import styles from './weekly-report-shell.module.css';

const WEEKLY_PAGE_MAX_WIDTH_CLASS = 'max-w-[1680px]';

/**
 * 周报页面（Client Component）
 *
 * 职责：
 * 1. 从 FilterContext 读取 weekPeriod 筛选
 * 2. 使用 useWeeklyReport Hook 获取数据（传递 weekPeriod）
 * 3. 从数据动态生成 Tab 配置（支持灵活扩展）
 * 4. 处理加载/错误状态
 * 5. 渲染报告内容
 *
 * 设计：
 * - Tab 配置从数据驱动，不再硬编码
 * - 支持任意数量的平台，可直接复用到月报/看板
 * - 平台标签映射可扩展
 */
export function WeeklyReportClient({
  reportId,
  initialWeekPeriod,
}: WeeklyReportClientProps) {
  const isMobile = useIsMobile();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const { filters, updateFilter } = useFilter();
  const normalizedReportId = normalizeQueryValue(reportId);
  const normalizedInitialWeekPeriod = normalizeQueryValue(initialWeekPeriod);
  const allowedDashboardTabs = useMemo(
    () =>
      resolveAllowedDashboardTabs({
        roles: user?.roles || [],
        isAuthenticated,
        identity: {
          username: user?.username,
          email: user?.email,
          fullName: user?.full_name,
        },
      }),
    [isAuthenticated, user?.email, user?.full_name, user?.roles, user?.username]
  );

  // 服务端 query 参数带入 weekPeriod 时，优先落到全局筛选
  useEffect(() => {
    if (normalizedInitialWeekPeriod && !filters.weekPeriod) {
      updateFilter('weekPeriod', normalizedInitialWeekPeriod);
    }
  }, [filters.weekPeriod, normalizedInitialWeekPeriod, updateFilter]);

  // 初始化默认周期（仅当筛选和路由参数都缺失时触发）
  const initialWeekPeriodState = useInitialWeekPeriod(normalizedInitialWeekPeriod);

  const activeWeekPeriod =
    normalizeQueryValue(filters.weekPeriod) || normalizedInitialWeekPeriod;
  const { data, isLoading, isFetching, error, refetch } = useWeeklyReport({
    reportId: normalizedReportId,
    weekPeriod: activeWeekPeriod,
    window: 7,
    enabled: true,
    // 默认走 all-periods 初始化，避免 latest-period 慢查询导致首屏卡死
    allowLatestFallback: false,
  });
  const hasData = Boolean(data);
  const isInitialLoading = isLoading && !hasData;
  const isBackgroundLoading = isFetching && hasData;
  const hasBackgroundError = Boolean(error) && hasData;
  const requestError = getWeeklyReportRequestError(error);
  const errorCode = requestError?.code;
  const isRequestTimeoutError =
    errorCode === 'REQUEST_TIMEOUT' ||
    requestError?.originalError?.code === 'ECONNABORTED';
  const isWaitingForQueryParams = !activeWeekPeriod && !normalizedReportId;

  const handleRetry = () => {
    void refetch();
  };

  const debouncedWeekPeriodChange = useMemo(
    () =>
      debounce((period: string) => {
        updateFilter('weekPeriod', normalizeQueryValue(period));
      }, WEEK_PERIOD_DEBOUNCE_MS),
    [updateFilter]
  );

  useEffect(() => {
    return () => {
      debouncedWeekPeriodChange.cancel();
    };
  }, [debouncedWeekPeriodChange]);

  const handleWeekPeriodChange = (period: string) => {
    debouncedWeekPeriodChange(period);
  };

  const tabs = useMemo(() => {
    if (!data) {
      return [];
    }
    const allowedTabSet = new Set(allowedDashboardTabs);
    return generateTabsFromReport(data).filter((tab) => {
      const resolvedKey = resolveDashboardTabKey(tab.key);
      if (!resolvedKey) {
        return true;
      }
      return allowedTabSet.has(resolvedKey);
    });
  }, [allowedDashboardTabs, data]);

  const resolvedActiveTab = useMemo(() => {
    if (!tabs.length) {
      return 'overview';
    }

    const hasActiveTab = tabs.some((tab) => tab.key === activeTab);
    return hasActiveTab ? activeTab : tabs[0].key;
  }, [activeTab, tabs]);

  // 参数初始化阶段：避免先闪“报告不存在”
  if (isWaitingForQueryParams) {
    if (initialWeekPeriodState.hasError) {
      return (
        <ErrorState
          title="周期加载失败"
          subTitle={initialWeekPeriodState.errorMessage || '获取周报周期失败，请检查后端服务后重试'}
          onRetry={handleRetry}
          status="500"
        />
      );
    }

    if (initialWeekPeriodState.isEmpty) {
      return (
        <ErrorState
          title="暂无可用周期"
          subTitle="尚未检索到可用的周报周期，请先检查 ADS 周表数据是否已生成"
          onRetry={handleRetry}
          status="404"
        />
      );
    }

    return <ReportSkeleton />;
  }

  // 错误状态（无可用数据时阻塞）
  if (error && !hasData) {
    if (isRequestTimeoutError) {
      return (
        <ErrorState
          title="加载超时"
          subTitle="周报数据请求超时，请检查后端服务或网络后重试"
          onRetry={handleRetry}
          errorCode={errorCode}
          status="500"
        />
      );
    }

    return (
      <ErrorState
        title="获取报告失败"
        subTitle={error.message || '无法加载周报数据，请稍后重试'}
        onRetry={handleRetry}
        errorCode={errorCode}
        status={
          errorCode === 'SERVICE_UNAVAILABLE' ? '503' :
          errorCode === 'NOT_FOUND' ? '404' :
          'error'
        }
      />
    );
  }

  // 确保有数据
  if (!isInitialLoading && !hasData) {
    return (
      <ErrorState
        title="报告不存在"
        subTitle={`未找到报告：${activeWeekPeriod || normalizedReportId || '-'}`}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="flex flex-col h-full weekly-report-client">
      {data ? (
        <>
          {(() => {
            const headerShell = (
              <div className="weekly-affix-surface weekly-affix-header-shell">
                <div className={`mx-auto w-full ${WEEKLY_PAGE_MAX_WIDTH_CLASS}`}>
                  <CompactHeader
                    weekPeriod={activeWeekPeriod}
                    onWeekPeriodChange={handleWeekPeriodChange}
                    middleContent={
                      <div
                        className={`weekly-header-tablist ${styles.headerTabList}`}
                        role="tablist"
                        aria-label="周报平台切换"
                      >
                        {tabs.map((tab) => {
                          const isActive = tab.key === resolvedActiveTab;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              className={`weekly-header-tab-btn ${styles.headerTabButton}${
                                isActive ? ` is-active ${styles.headerTabButtonActive}` : ''
                              }`}
                              onClick={() => setActiveTab(tab.key)}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    }
                  />
                </div>
              </div>
            );

            if (isMobile) {
              return headerShell;
            }

            return (
              <div className="sticky top-0 z-40">
                {headerShell}
              </div>
            );
          })()}

          {/* Tab 切换：从数据动态生成 */}
          <div className="flex-1 bg-global px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            {isBackgroundLoading ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-secondary px-3 py-1.5 text-xs text-brand-text mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                正在加载所选周期数据...
              </div>
            ) : null}

            {hasBackgroundError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-status-warning bg-status-warning-soft px-3 py-2.5 text-sm text-status-warning-strong mb-3">
                <span>新周期加载失败，当前展示上一周期数据。</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="border-0 bg-transparent text-status-warning cursor-pointer p-0 text-sm font-semibold hover:text-status-warning-strong"
                >
                  重试
                </button>
              </div>
            ) : null}

            <div className={`mx-auto w-full ${WEEKLY_PAGE_MAX_WIDTH_CLASS}`}>
              <Tabs
                activeKey={resolvedActiveTab}
                onChange={setActiveTab}
                items={tabs}
                className="light-tabs weekly-content-tabs"
                tabBarStyle={{ display: 'none' }}
              />
            </div>
          </div>
        </>
      ) : (
        <ReportSkeleton />
      )}
    </div>
  );
}
