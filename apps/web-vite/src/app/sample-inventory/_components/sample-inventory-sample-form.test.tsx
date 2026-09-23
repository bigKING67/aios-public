import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SampleFormModal } from "./sample-inventory-dialogs";
import {
  availableSample,
  installSampleInventoryWorkspaceTestEnvironment,
} from "./sample-inventory-workspace.test-support";

installSampleInventoryWorkspaceTestEnvironment();

describe("SampleFormModal manual reservation", () => {
  it("creates a sample with bounded reservation and a live available quantity", async () => {
    const onSubmit = vi.fn();
    render(
      <SampleFormModal
        open
        item={null}
        loading={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByLabelText("库位")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("库存 0，保存后可用 0");

    fireEvent.change(screen.getByLabelText("样品编码"), { target: { value: "S-100" } });
    fireEvent.change(screen.getByLabelText("样品名称"), { target: { value: "测试预留样品" } });
    fireEvent.change(screen.getByLabelText(/期初库存/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("预留"), { target: { value: "3" } });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("库存 10，保存后可用 7");
    });
    fireEvent.click(screen.getByRole("button", { name: /创\s*建/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleCode: "S-100",
          sampleName: "测试预留样品",
          initialQuantity: 10,
          reservedQuantity: 3,
        }),
      );
    });
  });

  it("loads edit reservation, hides location, and rejects reservation above stock", async () => {
    const onSubmit = vi.fn();
    render(
      <SampleFormModal
        open
        item={{ ...availableSample, location: "A-01" }}
        loading={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByLabelText("库位")).not.toBeInTheDocument();
    expect(screen.getByLabelText("预留")).toHaveValue("1");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("库存 8，保存后可用 7");
    });

    fireEvent.change(screen.getByLabelText("预留"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

    expect(await screen.findByText("预留不能超过库存")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
