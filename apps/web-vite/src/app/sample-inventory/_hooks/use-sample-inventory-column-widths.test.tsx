import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  useSampleInventoryColumnWidths,
  type SampleInventoryColumnWidthDefinition,
} from "./use-sample-inventory-column-widths";

type TestColumnKey = "identity" | "quantity";

const DEFINITIONS = [
  { key: "identity", defaultWidth: 220, minWidth: 100, maxWidth: 420 },
  { key: "quantity", defaultWidth: 90, minWidth: 60, maxWidth: 180 },
] as const satisfies readonly SampleInventoryColumnWidthDefinition<TestColumnKey>[];

const INVENTORY_STORAGE_KEY = "aios.sample-inventory.column-widths.v1.inventory";
const OUTBOUND_STORAGE_KEY = "aios.sample-inventory.column-widths.v1.outbound-records";

beforeEach(() => window.localStorage.clear());

describe("useSampleInventoryColumnWidths", () => {
  it("restores valid route-scoped widths and persists bounded keyboard changes", () => {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify({ identity: 300, quantity: 120 }));
    window.localStorage.setItem(OUTBOUND_STORAGE_KEY, JSON.stringify({ identity: 410, quantity: 160 }));

    const { result } = renderHook(() => useSampleInventoryColumnWidths("inventory", DEFINITIONS));

    expect(result.current.getWidth("identity")).toBe(300);
    expect(result.current.getWidth("quantity")).toBe(120);

    act(() => result.current.resizeBy("quantity", 100));

    expect(result.current.getWidth("quantity")).toBe(180);
    expect(JSON.parse(window.localStorage.getItem(INVENTORY_STORAGE_KEY) ?? "{}")).toEqual({
      identity: 300,
      quantity: 180,
    });
    expect(JSON.parse(window.localStorage.getItem(OUTBOUND_STORAGE_KEY) ?? "{}")).toEqual({
      identity: 410,
      quantity: 160,
    });
  });

  it("persists a pointer drag using the final bounded width", () => {
    function ResizeHarness() {
      const widths = useSampleInventoryColumnWidths("inventory", DEFINITIONS);
      return (
        <button
          type="button"
          onPointerDown={(event) => widths.startResize("identity", event)}
          aria-label="调整样品列宽"
        >
          {widths.getWidth("identity")}
        </button>
      );
    }

    render(<ResizeHarness />);
    const handle = screen.getByRole("button", { name: "调整样品列宽" });
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 165, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 165, pointerId: 1 });

    expect(handle).toHaveTextContent("285");
    expect(JSON.parse(window.localStorage.getItem(INVENTORY_STORAGE_KEY) ?? "{}")).toEqual({
      identity: 285,
      quantity: 90,
    });
  });

  it("fails closed to defaults when any persisted key or width is invalid", () => {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify({ identity: 300, quantity: 999 }));
    const invalidWidth = renderHook(() => useSampleInventoryColumnWidths("inventory", DEFINITIONS));

    expect(invalidWidth.result.current.getWidth("identity")).toBe(220);
    expect(invalidWidth.result.current.getWidth("quantity")).toBe(90);
    invalidWidth.unmount();

    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify({ identity: 300, unknown: 120 }));
    const unknownKey = renderHook(() => useSampleInventoryColumnWidths("inventory", DEFINITIONS));

    expect(unknownKey.result.current.getWidth("identity")).toBe(220);
    expect(unknownKey.result.current.getWidth("quantity")).toBe(90);
  });
});
