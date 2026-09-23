'use client';

import { KPIMetric } from '@/components/molecules/kpi-metric';
import { LineChart } from '@/components/organisms/line-chart';
import type { MonthlyReportResponse } from '@/types/reports';
import styles from './monthly-overview-tab.module.css';

interface MonthlyOverviewTabProps {
  report: MonthlyReportResponse;
}

/**
 * 月报概览 Tab：公司级 KPI + 30 天趋势
 *
 * 布局：
 * - 第一行：核心指标 KPI 卡片（6 个，2-3 列网格）
 * - 第二行：30 天趋势图表
 * - 第三行：概览文案 + 亮点和风险
 *
 * 特点：
 * - 复用周报的 KPIMetric 和 LineChart 组件
 * - 支持按 monthPeriod 筛选数据
 * - 显示月度环比增长率（环比前一个月）
 */
export function MonthlyOverviewTab({ report }: MonthlyOverviewTabProps) {
  const meta = report?.meta ?? {
    period_start: '',
    period_end: '',
  };
  const kpis = Array.isArray(report?.kpis) ? report.kpis : [];
  const trendRows = Array.isArray(report?.charts?.trend_nd) ? report.charts.trend_nd : [];
  const conclusions = {
    overall:
      typeof report?.conclusions?.overall === 'string' && report.conclusions.overall.trim()
        ? report.conclusions.overall
        : '暂无月报总结。',
    highlights: Array.isArray(report?.conclusions?.highlights) ? report.conclusions.highlights : [],
    risks: Array.isArray(report?.conclusions?.risks) ? report.conclusions.risks : [],
  };

  // 获取 GMV 趋势数据（30 天）
  const gmvTrend = trendRows.find((t) => t.metric === 'gmv');
  const gmvPoints = Array.isArray(gmvTrend?.points) ? gmvTrend.points : [];

  // 准备图表数据格式
  const chartData = gmvPoints.length > 0
    ? {
        series: [
          {
            name: 'GMV',
            data: gmvPoints.map((p) => p.value),
          },
        ],
        xAxis: gmvPoints.map((p) => {
          const date = new Date(p.date);
          if (Number.isNaN(date.getTime())) {
            return p.date;
          }
          return date.toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
          });
        }),
      }
    : null;

  return (
    <div className={styles.stack}>
      {/* 月份标识 */}
      {meta.period_start && (
        <div className={styles.periodBadge}>
          数据周期：<span className={styles.periodValue}>{meta.period_start} 至 {meta.period_end || '--'}</span>
        </div>
      )}

      {/* 核心指标卡片（4 列网格，响应式调整） */}
      <div>
        <h2 className={styles.sectionTitle}>
          核心指标
        </h2>
        <div className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <KPIMetric
              key={kpi.key}
              label={kpi.label}
              value={kpi.display_value}
              wow={
                kpi.wow !== undefined && kpi.wow !== null
                  ? {
                      value: kpi.wow,
                      direction: kpi.wow >= 0 ? 'up' : 'down',
                    }
                  : undefined
              }
              yoy={
                kpi.yoy !== undefined && kpi.yoy !== null
                  ? {
                      value: kpi.yoy,
                      direction: kpi.yoy >= 0 ? 'up' : 'down',
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* 分割线 */}
      <div className={styles.divider} />

      {/* 趋势图表（30 天） */}
      {chartData ? (
        <div>
          <h2 className={styles.sectionTitle}>
            30 天趋势
          </h2>
          <div className={styles.panel}>
            <LineChart data={chartData} height={300} />
          </div>
        </div>
      ) : null}

      {/* 分割线 */}
      <div className={styles.divider} />

      {/* 文案总结 */}
      <div>
        <h2 className={styles.sectionTitle}>
          月报总结
        </h2>
        <div className={styles.panel}>
          <div className={styles.summaryStack}>
            {/* 总体情况 */}
            <div>
              <p className={styles.summaryParagraph}>
                {conclusions.overall}
              </p>
            </div>

            {/* 亮点 */}
            {conclusions.highlights.length > 0 && (
              <div>
                <h3 className={`${styles.subSectionTitle} ${styles.highlightTitle}`}>
                  亮点
                </h3>
                <ul className={styles.summaryList}>
                  {conclusions.highlights.map((item, idx) => (
                    <li key={idx} className={styles.summaryListItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 风险 */}
            {conclusions.risks.length > 0 && (
              <div>
                <h3 className={`${styles.subSectionTitle} ${styles.riskTitle}`}>
                  风险
                </h3>
                <ul className={styles.summaryList}>
                  {conclusions.risks.map((item, idx) => (
                    <li key={idx} className={styles.summaryListItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
