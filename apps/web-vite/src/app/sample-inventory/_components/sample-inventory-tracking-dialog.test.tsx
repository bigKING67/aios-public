import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { SampleInventoryOutboundView } from "../_lib/sample-inventory-types";
import { SampleInventoryTrackingDialog } from "./sample-inventory-tracking-dialog";

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

afterEach(cleanup);
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sampledOutbound: SampleInventoryOutboundView = {
  id: 91,
  sampleId: 7,
  sampleCode: "S-007",
  sampleName: "测试样品",
  quantity: 1,
  applicant: "测试申请人",
  department: "测试部门",
  purpose: "测试用途",
  receiver: null,
  shippingAddress: null,
  trackingNumber: "OLD-TRACKING",
  status: "sampled",
  requestedAt: "2026-07-27T08:00:00Z",
  approvedAt: "2026-07-27T09:00:00Z",
  sampledAt: "2026-07-27T10:00:00Z",
  rejectedAt: null,
  timeQuality: "known",
  version: 4,
  createdAt: "2026-07-27T08:00:00Z",
  updatedAt: "2026-07-27T10:00:00Z",
};

describe("SampleInventoryTrackingDialog", () => {
  it("loads the current tracking number and submits only the trimmed replacement", async () => {
    const onSubmit = vi.fn();
    render(
      <SampleInventoryTrackingDialog item={sampledOutbound} loading={false} onCancel={vi.fn()} onSubmit={onSubmit} />,
    );

    const input = await screen.findByLabelText("快递单号");
    expect(input).toHaveValue("OLD-TRACKING");

    fireEvent.change(input, { target: { value: "  NEW-TRACKING  " } });
    fireEvent.click(screen.getByRole("button", { name: /保.*存/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("NEW-TRACKING"));
  });
});
