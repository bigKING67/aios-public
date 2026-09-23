'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Empty } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Link, useSearchParams } from 'react-router-dom';
import { downloadDashboardCsvFile } from '../_components/dashboard-export';
import { normalizeIndustryMaterialMonth } from './industry-material-inspiration-api';
import { backfillIndustryMaterialBrandAiAnalysis } from './industry-material-inspiration-transport';
import { BrandAiInsightPanel } from './industry-material-brand-ai-insight-panel';
import {
  ALL_BRANDS_KEY,
  buildBrandFilterOptions,
  buildIndustryMaterialDetailCsvFileName,
  buildIndustryMaterialDetailCsvText,
  buildSummaryMetrics,
  isDouyinMaterialTab,
  normalizeAvailableMonths,
  normalizeBrandKey,
  normalizeMonthOptions,
  normalizeTab,
  resolveErrorMessage,
  resolveInitialBrandKey,
  resolveInitialMonth,
  resolveRowKey,
  resolveSelectedBrandLabel,
  resolveTabLabel,
  writeControlParams,
} from './industry-material-inspiration-client-helpers';
import {
  IndustryMaterialSummaryGrid,
  IndustryMaterialTablePanel,
} from './industry-material-inspiration-content';
import { IndustryMaterialTopBar } from './industry-material-inspiration-top-bar';
import type {
  IndustryMaterialBrandAiBackfillPayload,
  IndustryMaterialBrandAiBackfillResponse,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';
import { useIndustryMaterialInspirationQuery } from './use-industry-material-inspiration-query';
import '../_components/dashboard-token-aliases.css';
import styles from './industry-material-inspiration.module.css';

dayjs.locale('zh-cn');

const BRAND_AI_BACKFILL_LIMIT = 100;
const BRAND_AI_BACKFILL_SOURCE = 'auto';
const BRAND_AI_BACKFILL_PROFILE = 'preview_fast';

interface BrandAiBackfillResultState {
  scopeKey: string;
  result: IndustryMaterialBrandAiBackfillResponse;
}

function buildBrandAiBackfillScopeKey(tab: IndustryMaterialTab, month: string, brand: string): string {
  return `${tab}:${month}:${brand}`;
}

export function IndustryMaterialInspirationClient() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<IndustryMaterialTab>(() => normalizeTab(searchParams.get('tab')));
  const [month, setMonth] = useState(() => resolveInitialMonth(searchParams));
  const [selectedBrandKey, setSelectedBrandKey] = useState(() => resolveInitialBrandKey(searchParams));
  const [lastBackfillResult, setLastBackfillResult] = useState<BrandAiBackfillResultState | null>(null);
  const isDouyinTab = isDouyinMaterialTab(activeTab);
  const activeTabLabel = resolveTabLabel(activeTab);
  const apiBrand = selectedBrandKey === ALL_BRANDS_KEY ? null : selectedBrandKey;
  const backfillMutation = useMutation<
    IndustryMaterialBrandAiBackfillResponse,
    unknown,
    IndustryMaterialBrandAiBackfillPayload
  >({
    mutationFn: backfillIndustryMaterialBrandAiAnalysis,
  });
  const {
    data,
    error,
    isFetching,
    isLoading,
    refetch,
    dashboardQueryKey,
    startBrandAiPolling,
  } = useIndustryMaterialInspirationQuery({
    activeTab,
    month,
    selectedBrandKey,
    apiBrand,
    isDouyinTab,
  });

  const rows = useMemo(
    () => (isDouyinTab ? data?.rows ?? [] : []),
    [data?.rows, isDouyinTab]
  );
  const apiAvailableMonths = useMemo(
    () => (isDouyinTab ? normalizeMonthOptions(data?.availableMonths ?? []) : []),
    [data?.availableMonths, isDouyinTab]
  );
  const responseMonth = isDouyinTab ? normalizeIndustryMaterialMonth(data?.month) : null;
  const displayMonth = responseMonth ?? month ?? apiAvailableMonths[0] ?? dayjs().format('YYYY-MM');
  const backfillScopeKey = buildBrandAiBackfillScopeKey(activeTab, displayMonth, selectedBrandKey);
  const activeBackfillMutationScopeKey = backfillMutation.variables
    ? buildBrandAiBackfillScopeKey(
        backfillMutation.variables.tab,
        backfillMutation.variables.month,
        backfillMutation.variables.brand
      )
    : null;
  const scopedBackfillResult =
    lastBackfillResult?.scopeKey === backfillScopeKey ? lastBackfillResult.result : null;
  const scopedBackfillErrorMessage =
    backfillMutation.isError && activeBackfillMutationScopeKey === backfillScopeKey
      ? resolveErrorMessage(backfillMutation.error)
      : null;
  const isBackfillPending = backfillMutation.isPending && activeBackfillMutationScopeKey === backfillScopeKey;
  const availableMonths = useMemo(
    () => normalizeAvailableMonths(month, apiAvailableMonths),
    [apiAvailableMonths, month]
  );
  const tableRows = useMemo(
    () => rows.map((row, index) => ({ ...row, rowKey: resolveRowKey(row, index) })),
    [rows]
  );
  const brandFilterOptions = useMemo(
    () => buildBrandFilterOptions(isDouyinTab ? data?.brandOptions : []),
    [data?.brandOptions, isDouyinTab]
  );
  const selectedBrandLabel = useMemo(
    () =>
      resolveSelectedBrandLabel({
        selectedBrandKey,
        selectedBrand: data?.selectedBrand,
        brandOptions: data?.brandOptions,
      }),
    [data?.brandOptions, data?.selectedBrand, selectedBrandKey]
  );
  const summaryMetrics = useMemo(() => buildSummaryMetrics(rows, data?.summary ?? null), [data?.summary, rows]);
  const monthValue = dayjs(`${displayMonth}-01`).locale('zh-cn');
  const monthQueryWasProvided = Boolean(normalizeIndustryMaterialMonth(searchParams.get('month')));

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get('tab'));
    const nextMonth = resolveInitialMonth(searchParams);
    const nextBrandKey = isDouyinMaterialTab(nextTab) ? resolveInitialBrandKey(searchParams) : ALL_BRANDS_KEY;

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
    if (nextMonth !== month) {
      setMonth(nextMonth);
    }
    if (nextBrandKey !== selectedBrandKey) {
      setSelectedBrandKey(nextBrandKey);
    }
  }, [activeTab, month, searchParams, selectedBrandKey]);

  useEffect(() => {
    if (!searchParams.has('brand')) {
      return;
    }
    if (isDouyinTab && normalizeBrandKey(searchParams.get('brand')) !== ALL_BRANDS_KEY) {
      return;
    }
    const nextParams = writeControlParams({
      currentParams: searchParams,
      nextTab: activeTab,
      nextMonth: month,
      nextBrandKey: ALL_BRANDS_KEY,
    });
    setSearchParams(nextParams, { replace: true });
  }, [activeTab, isDouyinTab, month, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isDouyinTab || monthQueryWasProvided || !responseMonth || responseMonth === month) {
      return;
    }
    startTransition(() => {
      setMonth(responseMonth);
      const nextParams = writeControlParams({
        currentParams: searchParams,
        nextTab: activeTab,
        nextMonth: responseMonth,
        nextBrandKey: selectedBrandKey,
      });
      setSearchParams(nextParams, { replace: true });
    });
  }, [
    activeTab,
    isDouyinTab,
    month,
    monthQueryWasProvided,
    responseMonth,
    searchParams,
    selectedBrandKey,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!isDouyinTab || selectedBrandKey === ALL_BRANDS_KEY || !data) {
      return;
    }
    const canonicalBrandKey = data.selectedBrand?.key;
    if (canonicalBrandKey && canonicalBrandKey !== selectedBrandKey) {
      startTransition(() => {
        setSelectedBrandKey(canonicalBrandKey);
        const nextParams = writeControlParams({
          currentParams: searchParams,
          nextTab: activeTab,
          nextMonth: month,
          nextBrandKey: canonicalBrandKey,
        });
        setSearchParams(nextParams, { replace: true });
      });
      return;
    }
    const brandIsAvailable = data.brandOptions.some((brand) => brand.key === selectedBrandKey);
    if (canonicalBrandKey || brandIsAvailable) {
      return;
    }
    startTransition(() => {
      setSelectedBrandKey(ALL_BRANDS_KEY);
      const nextParams = writeControlParams({
        currentParams: searchParams,
        nextTab: activeTab,
        nextMonth: month,
        nextBrandKey: ALL_BRANDS_KEY,
      });
      setSearchParams(nextParams, { replace: true });
    });
  }, [activeTab, data, isDouyinTab, month, searchParams, selectedBrandKey, setSearchParams]);

  const commitControls = (
    nextTab: IndustryMaterialTab,
    nextMonth: string | null,
    nextBrandKey = selectedBrandKey
  ) => {
    const normalizedBrandKey = isDouyinMaterialTab(nextTab) ? normalizeBrandKey(nextBrandKey) : ALL_BRANDS_KEY;
    startTransition(() => {
      setActiveTab(nextTab);
      setMonth(nextMonth);
      setSelectedBrandKey(normalizedBrandKey);
      const nextParams = writeControlParams({
        currentParams: searchParams,
        nextTab,
        nextMonth,
        nextBrandKey: normalizedBrandKey,
      });
      setSearchParams(nextParams, { replace: true });
    });
  };

  const disableUnavailableMonth = (current: Dayjs) => {
    if (!availableMonths.length) {
      return false;
    }
    return !availableMonths.includes(current.format('YYYY-MM'));
  };

  const emptyDescription = error
    ? '接口暂不可用，已保留页面结构；请在后端接入后刷新。'
    : '当前月份暂无行业素材记录，请检查月份、ADS 刷新或素材归档状态。';

  const handleExportDetails = () => {
    if (!tableRows.length) {
      return;
    }
    const csvText = buildIndustryMaterialDetailCsvText(tableRows);
    const fileName = buildIndustryMaterialDetailCsvFileName({
      activeTabLabel,
      displayMonth,
      selectedBrandKey,
      selectedBrandLabel,
    });
    downloadDashboardCsvFile(csvText, fileName);
  };

  const handleBackfillBrandAiAnalysis = () => {
    if (!isDouyinMaterialTab(activeTab) || selectedBrandKey === ALL_BRANDS_KEY) {
      return;
    }

    const payload: IndustryMaterialBrandAiBackfillPayload = {
      tab: activeTab,
      month: displayMonth,
      brand: selectedBrandKey,
      source: BRAND_AI_BACKFILL_SOURCE,
      profile: BRAND_AI_BACKFILL_PROFILE,
      limit: BRAND_AI_BACKFILL_LIMIT,
    };
    const scopeKey = buildBrandAiBackfillScopeKey(payload.tab, payload.month, payload.brand);

    setLastBackfillResult(null);
    void backfillMutation
      .mutateAsync(payload)
      .then((result) => {
        setLastBackfillResult({ scopeKey, result });
        if ((result.queuedJobs ?? 0) > 0) {
          startBrandAiPolling();
        }
        void queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
      })
      .catch(() => {
        // React Query exposes the error state to the panel; avoid an unhandled promise rejection.
      });
  };

  return (
    <div className={styles.pageRoot}>
      <div className={styles.backdropGlow} aria-hidden />
      <main className={styles.surface}>
        <IndustryMaterialTopBar
          activeTab={activeTab}
          month={month}
          selectedBrandKey={selectedBrandKey}
          isDouyinTab={isDouyinTab}
          brandFilterOptions={brandFilterOptions}
          isFetching={isFetching}
          hasTableRows={tableRows.length > 0}
          brandOptionCount={data?.brandOptions.length ?? 0}
          monthValue={monthValue}
          disableUnavailableMonth={disableUnavailableMonth}
          onCommitControls={commitControls}
          onRefresh={() => void refetch()}
        />

        {error && isDouyinTab ? (
          <Alert
            className={styles.errorBanner}
            type="error"
            showIcon
            message={`${activeTabLabel}数据加载失败`}
            description={resolveErrorMessage(error)}
          />
        ) : null}

        {isDouyinTab ? (
          <>
            <IndustryMaterialSummaryGrid
              displayMonth={displayMonth}
              activeTabLabel={activeTabLabel}
              isLoading={isLoading}
              metrics={summaryMetrics}
            />

            <BrandAiInsightPanel
              activeTab={activeTab}
              activeTabLabel={activeTabLabel}
              displayMonth={displayMonth}
              selectedBrandKey={selectedBrandKey}
              selectedBrandLabel={selectedBrandLabel}
              insight={data?.brandInsight ?? null}
              isLoading={isFetching}
              isBackfillPending={isBackfillPending}
              backfillResult={scopedBackfillResult}
              backfillErrorMessage={scopedBackfillErrorMessage}
              onBackfillMissingAnalysis={handleBackfillBrandAiAnalysis}
            />

            <IndustryMaterialTablePanel
              activeTabLabel={activeTabLabel}
              rows={tableRows}
              isFetching={isFetching}
              emptyDescription={emptyDescription}
              onExportDetails={handleExportDetails}
            />
          </>
        ) : (
          <section className={styles.placeholderPanel}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="小红书笔记数据源暂未接入">
              <p className={styles.placeholderText}>
                当前仅保留 Tab 与月份筛选入口，待笔记 ADS 和素材归档链路接入后展示同一套业务指标。
              </p>
              <Link className={styles.placeholderLink} to="/marketing/content-assets">
                先查看内容资产库
              </Link>
            </Empty>
          </section>
        )}
      </main>
    </div>
  );
}

export default IndustryMaterialInspirationClient;
