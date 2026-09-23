import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SettingsModal } from "./sample-inventory-operation-dialogs";

beforeAll(() => {
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

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("SettingsModal", () => {
  it("keeps inventory freshness automatic and submits only the low-stock threshold", async () => {
    const onSubmit = vi.fn();
    render(
      <SettingsModal
        open
        settings={{
          lowStockThreshold: 3,
          refreshIntervalSeconds: 0,
          version: 1,
          updatedAt: "2026-07-28T00:00:00Z",
        }}
        loading={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("样品库存设置");
    expect(screen.getByRole("spinbutton", { name: "主品低库存阈值" })).toHaveValue("3");
    expect(screen.queryByText("自动刷新间隔（秒）")).not.toBeInTheDocument();
    expect(screen.queryByText(/关闭自动刷新/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "主品低库存阈值" }), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ lowStockThreshold: 5 }));
  });
});
