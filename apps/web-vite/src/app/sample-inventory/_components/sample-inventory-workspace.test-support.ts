import { cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import type { SampleInventoryOutboundView } from "../_lib/sample-inventory-types";
import type { SampleInventorySample } from "@/lib/generated-api-contract";
import { SampleInventoryWorkspace } from "./sample-inventory-workspace";

export function installSampleInventoryWorkspaceTestEnvironment() {
  beforeAll(() => {
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  afterEach(cleanup);
}

export const pendingOutbound: SampleInventoryOutboundView = {
  id: 41,
  sampleId: 7,
  sampleCode: "S-007",
  sampleName: "测试样品",
  quantity: 2,
  applicant: "测试申请人",
  department: "测试部门",
  purpose: "陈列测试",
  receiver: null,
  shippingAddress: null,
  trackingNumber: null,
  status: "pending",
  requestedAt: "2026-07-26T08:00:00Z",
  approvedAt: null,
  sampledAt: null,
  rejectedAt: null,
  timeQuality: "known",
  version: 3,
  createdAt: "2026-07-26T08:00:00Z",
  updatedAt: "2026-07-26T08:00:00Z",
};

export const availableSample: SampleInventorySample = {
  id: 7,
  sampleCode: "S-007",
  sampleName: "测试样品",
  model: "M-1",
  category: null,
  productKind: "primary",
  location: null,
  remark: null,
  onHandQuantity: 8,
  reservedQuantity: 1,
  availableQuantity: 7,
  isLowStock: false,
  version: 2,
  createdAt: "2026-07-26T08:00:00Z",
  updatedAt: "2026-07-26T08:00:00Z",
  archivedAt: null,
};

export function workspaceProps(
  overrides: Partial<ComponentProps<typeof SampleInventoryWorkspace>> = {},
): ComponentProps<typeof SampleInventoryWorkspace> {
  return {
    state: {
      tab: "outbound",
      keyword: "",
      status: "pending",
      stockStatus: "all",
      productKind: "all",
      sortOrder: "default",
      dateFrom: "",
      dateTo: "",
      page: 1,
      pageSize: 20,
    },
    searchDraft: "",
    readOnly: false,
    pageSize: 20,
    sampleOptions: [],
    settingsError: null,
    sampleOptionsError: null,
    inventory: { items: [], total: 0, loading: false, error: null },
    outbounds: {
      items: [pendingOutbound],
      total: 1,
      loading: false,
      error: null,
    },
    inbounds: { items: [], total: 0, loading: false, error: null },
    selectedIds: [],
    selectedSampleIds: [],
    selectedInboundIds: [],
    outboundSubmitting: false,
    inboundSubmitting: false,
    backupDownloading: false,
    onCreateOutboundBatch: vi.fn(),
    onCreateInbound: vi.fn(),
    onSearchDraftChange: vi.fn(),
    onSearch: vi.fn(),
    onTabChange: vi.fn(),
    onStatusChange: vi.fn(),
    onStockStatusChange: vi.fn(),
    onProductKindChange: vi.fn(),
    onInventorySortChange: vi.fn(),
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onPaginationChange: vi.fn(),
    onSelectedIdsChange: vi.fn(),
    onSelectedSampleIdsChange: vi.fn(),
    onSelectedInboundIdsChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenSample: vi.fn(),
    onAdjustSample: vi.fn(),
    onArchiveSample: vi.fn(),
    onOpenOutbound: vi.fn(),
    onEditOutboundTracking: vi.fn(),
    onTransitionOutbound: vi.fn(),
    onArchiveOutbound: vi.fn(),
    onVoidInbound: vi.fn(),
    onBatchTransition: vi.fn(),
    onBatchArchive: vi.fn(),
    onBatchArchiveSamples: vi.fn(),
    onBatchVoidInbounds: vi.fn(),
    onBatchTracking: vi.fn(),
    onBatchEditPending: vi.fn(),
    onOpenImport: vi.fn(),
    onOpenBatchInbound: vi.fn(),
    onBackup: vi.fn(),
    onRestore: vi.fn(),
    onDownload: vi.fn(),
    ...overrides,
  };
}
