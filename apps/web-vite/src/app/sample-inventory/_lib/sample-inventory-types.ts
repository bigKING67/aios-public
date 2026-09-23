import type { SampleInventoryOutbound, SampleInventoryOutboundListResponse } from "@/lib/generated-api-contract";

export const SAMPLE_INVENTORY_TABS = [
  "outbound",
  "inventory",
  "inbound",
  "outbound-records",
  "inbound-records",
] as const;

export type SampleInventoryTab = (typeof SAMPLE_INVENTORY_TABS)[number];

export const OUTBOUND_STATUSES = ["pending", "approved", "sampled", "rejected"] as const;

export type SampleInventoryOutboundStatus = (typeof OUTBOUND_STATUSES)[number];
export type SampleInventoryOutboundFilter = SampleInventoryOutboundStatus | "all";

export const SAMPLE_INVENTORY_STOCK_STATUSES = ["all", "in_stock", "low", "out"] as const;
export type SampleInventoryStockStatus = (typeof SAMPLE_INVENTORY_STOCK_STATUSES)[number];
export const SAMPLE_INVENTORY_PRODUCT_KINDS = ["all", "primary", "gift"] as const;
export type SampleInventoryProductKind = (typeof SAMPLE_INVENTORY_PRODUCT_KINDS)[number];
export const SAMPLE_INVENTORY_PAGE_SIZES = [20, 50, 100] as const;
export type SampleInventoryPageSize = (typeof SAMPLE_INVENTORY_PAGE_SIZES)[number];
export type SampleInventorySortOrder = "default" | "asc" | "desc";

export type SampleInventoryOutboundView = Omit<SampleInventoryOutbound, "status"> & {
  status: SampleInventoryOutboundStatus;
};

export type SampleInventoryOutboundListView = Omit<SampleInventoryOutboundListResponse, "items"> & {
  items: SampleInventoryOutboundView[];
};

export type SampleInventorySampleQuery = {
  keyword?: string;
  includeArchived?: boolean;
  stockStatus?: Exclude<SampleInventoryStockStatus, "all">;
  productKind?: Exclude<SampleInventoryProductKind, "all">;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "sampleCode" | "sampleName" | "availableQuantity" | "updatedAt";
  sortOrder?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type SampleInventoryInboundQuery = {
  keyword?: string;
  sampleId?: number;
  includeVoided?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "occurredAt" | "sampleCode" | "quantity" | "trackingNumber";
  sortOrder?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type SampleInventoryOutboundQuery = {
  keyword?: string;
  status?: SampleInventoryOutboundStatus;
  sampleId?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "requestedAt" | "sampleCode" | "applicant" | "department" | "status" | "trackingNumber";
  sortOrder?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type SampleInventoryUrlState = {
  tab: SampleInventoryTab;
  keyword: string;
  status?: SampleInventoryOutboundFilter;
  stockStatus: SampleInventoryStockStatus;
  productKind: SampleInventoryProductKind;
  sortOrder: SampleInventorySortOrder;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: SampleInventoryPageSize;
};

export function isSampleInventoryTab(value: string | null): value is SampleInventoryTab {
  return SAMPLE_INVENTORY_TABS.includes(value as SampleInventoryTab);
}

export function isOutboundStatus(value: string | null | undefined): value is SampleInventoryOutboundStatus {
  return OUTBOUND_STATUSES.includes(value as SampleInventoryOutboundStatus);
}

export function isSampleInventoryStockStatus(value: string | null): value is SampleInventoryStockStatus {
  return SAMPLE_INVENTORY_STOCK_STATUSES.includes(value as SampleInventoryStockStatus);
}

export function isSampleInventoryProductKind(value: string | null): value is SampleInventoryProductKind {
  return SAMPLE_INVENTORY_PRODUCT_KINDS.includes(value as SampleInventoryProductKind);
}

export function normalizeSampleInventoryPageSize(value: string | null): SampleInventoryPageSize {
  const parsed = Number(value);
  return SAMPLE_INVENTORY_PAGE_SIZES.includes(parsed as SampleInventoryPageSize)
    ? (parsed as SampleInventoryPageSize)
    : 20;
}

export function isSampleInventorySortOrder(value: string | null): value is SampleInventorySortOrder {
  return value === "default" || value === "asc" || value === "desc";
}

export function normalizeSampleInventoryDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function sampleInventoryDateStart(value: string): string | undefined {
  return value ? `${value}T00:00:00+08:00` : undefined;
}

export function sampleInventoryDateEnd(value: string): string | undefined {
  return value ? `${value}T23:59:59.999+08:00` : undefined;
}

export function normalizeOutboundStatus(value: string): SampleInventoryOutboundStatus {
  if (isOutboundStatus(value)) {
    return value;
  }
  throw new Error(`Unsupported sample inventory outbound status: ${value}`);
}
