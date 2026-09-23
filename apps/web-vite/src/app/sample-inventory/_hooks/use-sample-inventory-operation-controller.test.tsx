import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { availableSample } from "../_components/sample-inventory-workspace.test-support";
import { useSampleInventoryOperationController } from "./use-sample-inventory-operation-controller";

type ControllerOptions = Parameters<typeof useSampleInventoryOperationController>[0];

describe("useSampleInventoryOperationController sample payload", () => {
  it("preserves hidden historical location on edit and sends explicit reservation", () => {
    const updateSample = vi.fn();
    const createSample = vi.fn();
    const actions = {
      updateSampleMutation: { mutate: updateSample },
      createSampleMutation: { mutate: createSample },
    } as unknown as ControllerOptions["actions"];
    const { result } = renderHook(() =>
      useSampleInventoryOperationController({ actions, guardWrite: () => true }),
    );
    const existing = { ...availableSample, location: "A-01" };

    act(() => result.current.openSample(existing));
    act(() =>
      result.current.submitSample({
        sampleCode: existing.sampleCode,
        sampleName: "更新名称",
        model: existing.model ?? undefined,
        category: existing.category ?? undefined,
        remark: existing.remark ?? undefined,
        reservedQuantity: 2,
      }),
    );

    expect(updateSample).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleId: existing.id,
        payload: expect.objectContaining({
          location: "A-01",
          reservedQuantity: 2,
        }),
      }),
      expect.any(Object),
    );

    act(() => result.current.openSample());
    act(() =>
      result.current.submitSample({
        sampleCode: "S-NEW",
        sampleName: "新样品",
        initialQuantity: 10,
        reservedQuantity: 3,
      }),
    );

    expect(createSample).toHaveBeenCalledWith(
      expect.objectContaining({
        location: undefined,
        initialQuantity: 10,
        reservedQuantity: 3,
      }),
      expect.any(Object),
    );
  });
});
