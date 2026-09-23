import type {
  SampleInventoryOutboundStatus,
  SampleInventoryTab,
} from "./sample-inventory-types";
import type { SampleInventorySample } from "@/lib/generated-api-contract";

export function orderSampleInventoryOptions(
  samples: readonly SampleInventorySample[],
): SampleInventorySample[] {
  return [...samples].sort((left, right) => left.id - right.id);
}

export const SAMPLE_INVENTORY_TAB_ITEMS = [
  { key: "outbound", label: "领用处理" },
  { key: "inventory", label: "库存台账" },
  { key: "inbound", label: "入库登记" },
  { key: "outbound-records", label: "领用记录" },
  { key: "inbound-records", label: "入库记录" },
] satisfies Array<{ key: SampleInventoryTab; label: string }>;

export const SAMPLE_INVENTORY_STATUS_OPTIONS = [
  { value: "pending", label: "待审批" },
  { value: "approved", label: "已审批" },
  { value: "sampled", label: "已取样" },
  { value: "rejected", label: "已驳回" },
] satisfies Array<{ value: SampleInventoryOutboundStatus; label: string }>;
