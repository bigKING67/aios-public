import type { SampleInventorySummary } from "@/lib/generated-api-contract";
import type { SampleInventoryTab } from "../_lib/sample-inventory-types";
import styles from "../sample-inventory-workspace.module.css";

type Metric = {
  label: string;
  value: number;
  tone: "blue" | "green" | "orange" | "purple" | "teal" | "red";
};

function metricsForTab(
  tab: SampleInventoryTab,
  summary?: SampleInventorySummary,
): Metric[] {
  const value = (metric: number | undefined) => metric ?? 0;
  if (tab === "outbound") {
    return [
      { label: "可选样品数", value: value(summary?.availableSampleCount), tone: "blue" },
      { label: "待审批", value: value(summary?.pendingOutboundCount), tone: "orange" },
      { label: "已审批", value: value(summary?.approvedOutboundCount), tone: "green" },
      { label: "已取样", value: value(summary?.sampledOutboundCount), tone: "teal" },
      { label: "已驳回", value: value(summary?.rejectedOutboundCount), tone: "red" },
    ];
  }
  if (tab === "inventory") {
    return [
      { label: "样品种类", value: value(summary?.sampleCount), tone: "blue" },
      { label: "总库存数量", value: value(summary?.totalOnHand), tone: "green" },
      { label: "主品低库存（≤阈值）", value: value(summary?.lowStockCount), tone: "orange" },
      { label: "累计出库量", value: value(summary?.totalOutboundQuantity), tone: "purple" },
    ];
  }
  if (tab === "inbound") {
    return [
      { label: "总入库数量", value: value(summary?.totalInboundQuantity), tone: "blue" },
      { label: "今日入库", value: value(summary?.todayInboundQuantity), tone: "green" },
    ];
  }
  if (tab === "outbound-records") {
    return [
      { label: "总出库数量", value: value(summary?.totalOutboundQuantity), tone: "purple" },
      { label: "出库单数", value: value(summary?.outboundRequestCount), tone: "blue" },
      { label: "申领人数", value: value(summary?.outboundApplicantCount), tone: "green" },
    ];
  }
  return [
    { label: "总入库数量", value: value(summary?.totalInboundQuantity), tone: "blue" },
    { label: "入库单数", value: value(summary?.inboundRecordCount), tone: "green" },
    { label: "操作人数", value: value(summary?.inboundOperatorCount), tone: "purple" },
  ];
}

export function SampleInventoryStatStrip({
  tab,
  summary,
}: {
  tab: SampleInventoryTab;
  summary?: SampleInventorySummary;
}) {
  const metrics = metricsForTab(tab, summary);
  return (
    <div className={styles.stats} data-count={metrics.length}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.statCard}>
          <strong className={styles[`stat-${metric.tone}`]}>{metric.value}</strong>
          <span>{metric.label}</span>
        </div>
      ))}
    </div>
  );
}
