import { describe, expect, it } from "vitest";

import type { SampleInventorySample } from "@/lib/generated-api-contract";
import {
  orderSampleInventoryOptions,
  SAMPLE_INVENTORY_STATUS_OPTIONS,
} from "./sample-inventory-view-options";

const sample = (id: number, sampleName: string): SampleInventorySample => ({
  id,
  sampleCode: `S-${id}`,
  sampleName,
  model: null,
  category: null,
  productKind: "gift",
  location: null,
  remark: null,
  onHandQuantity: id,
  reservedQuantity: 0,
  availableQuantity: id,
  isLowStock: false,
  version: 1,
  createdAt: "2026-07-28T00:00:00Z",
  updatedAt: "2026-07-28T00:00:00Z",
  archivedAt: null,
});

describe("orderSampleInventoryOptions", () => {
  it("keeps the legacy business insertion sequence and leaves the source untouched", () => {
    const source = [sample(9, "后录入"), sample(2, "先录入"), sample(5, "中间录入")];

    expect(orderSampleInventoryOptions(source).map((item) => item.id)).toEqual([2, 5, 9]);
    expect(source.map((item) => item.id)).toEqual([9, 2, 5]);
  });

  it("labels the stock-debit state as approved instead of reserved", () => {
    expect(SAMPLE_INVENTORY_STATUS_OPTIONS).toContainEqual({ value: "approved", label: "已审批" });
    expect(SAMPLE_INVENTORY_STATUS_OPTIONS.map((option) => option.label)).not.toContain("已预留");
  });
});
