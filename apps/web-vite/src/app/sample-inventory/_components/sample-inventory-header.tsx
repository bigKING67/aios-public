import { Alert, Button } from "antd";
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";

import type { SampleInventorySummary } from "@/lib/generated-api-contract";
import styles from "../sample-inventory.module.css";

type SampleInventoryHeaderProps = {
  summary?: SampleInventorySummary;
  readOnly: boolean;
  settingsError: unknown;
  sampleOptionsError: unknown;
  onOpenSettings: () => void;
  onOpenSample: () => void;
};

export function SampleInventoryHeader({
  summary,
  readOnly,
  settingsError,
  sampleOptionsError,
  onOpenSettings,
  onOpenSample,
}: SampleInventoryHeaderProps) {
  const metrics = [
    ["样品数", summary?.sampleCount],
    ["在手总量", summary?.totalOnHand],
    ["预留总量", summary?.totalReserved],
    ["可用总量", summary?.totalAvailable],
    ["主品低库存", summary?.lowStockCount],
    ["待审批", summary?.pendingOutboundCount],
  ] as const;

  return (
    <>
      <section className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>OPERATIONS / SAMPLE LEDGER</span>
          <h1 className={styles.title}>样品库存</h1>
          <p className={styles.subtitle}>
            统一处理样品建档、入库、预留、取样与可追溯库存流水。
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onOpenSample}>
            新建样品
          </Button>
        </div>
      </section>

      {readOnly && (
        <Alert
          type="warning"
          showIcon
          message="当前为只读运行模式"
          description="列表和库存读取保持正常，所有写操作已暂停；服务恢复后刷新页面再试。"
        />
      )}
      {Boolean(settingsError || sampleOptionsError) && (
        <Alert
          type="warning"
          showIcon
          message="部分基础数据未加载"
          description="设置或样品选择项暂不可用；已有台账仍可查看，请稍后刷新。"
        />
      )}

      <section className={styles.metricStrip} aria-label="库存摘要">
        {metrics.map(([label, value]) => (
          <div className={styles.metricItem} key={label}>
            <span className={styles.metricLabel}>{label}</span>
            <strong className={styles.metricValue}>{value ?? "--"}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
