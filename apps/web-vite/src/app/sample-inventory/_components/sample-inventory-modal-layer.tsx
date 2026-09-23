import type {
  SampleInventoryInbound,
  SampleInventoryOutbound,
  SampleInventorySample,
  SampleInventorySettings,
} from "@/lib/generated-api-contract";
import type { useSampleInventoryActions } from "../_hooks/use-sample-inventory-actions";
import {
  AdjustmentModal,
  type AdjustmentFormValues,
} from "./sample-inventory-adjustment-dialog";
import {
  InboundFormModal,
  OutboundFormModal,
  SampleFormModal,
  type InboundFormValues,
  type OutboundFormValues,
  type SampleFormValues,
} from "./sample-inventory-dialogs";
import {
  SampleInventoryImportModal,
  SettingsModal,
  VoidInboundModal,
  type SampleInventoryImportPreview,
  type SettingsFormValues,
  type VoidInboundFormValues,
} from "./sample-inventory-operation-dialogs";

type SampleInventoryModalLayerProps = {
  actions: ReturnType<typeof useSampleInventoryActions>;
  samples: SampleInventorySample[];
  settings?: SampleInventorySettings;
  sampleTarget: SampleInventorySample | null | undefined;
  adjustTarget: SampleInventorySample | null | undefined;
  inboundOpen: boolean;
  voidInboundTarget: SampleInventoryInbound | null | undefined;
  outboundTarget: SampleInventoryOutbound | null | undefined;
  settingsOpen: boolean;
  importKind: "samples" | "inbounds" | null;
  importPreview?: SampleInventoryImportPreview;
  onCloseSample: () => void;
  onCloseAdjustment: () => void;
  onCloseInbound: () => void;
  onCloseVoidInbound: () => void;
  onCloseOutbound: () => void;
  onCloseSettings: () => void;
  onCloseImport: () => void;
  onSubmitSample: (values: SampleFormValues) => void;
  onSubmitAdjustment: (values: AdjustmentFormValues) => void;
  onSubmitInbound: (values: InboundFormValues) => void;
  onSubmitVoidInbound: (values: VoidInboundFormValues) => void;
  onSubmitOutbound: (values: OutboundFormValues) => void;
  onSubmitSettings: (values: SettingsFormValues) => void;
  onParseImport: (file: File) => void;
  onImport: () => void;
  onDownloadImportTemplate: (kind: "samples" | "inbounds") => void;
};

export function SampleInventoryModalLayer({
  actions,
  samples,
  settings,
  sampleTarget,
  adjustTarget,
  inboundOpen,
  voidInboundTarget,
  outboundTarget,
  settingsOpen,
  importKind,
  importPreview,
  onCloseSample,
  onCloseAdjustment,
  onCloseInbound,
  onCloseVoidInbound,
  onCloseOutbound,
  onCloseSettings,
  onCloseImport,
  onSubmitSample,
  onSubmitAdjustment,
  onSubmitInbound,
  onSubmitVoidInbound,
  onSubmitOutbound,
  onSubmitSettings,
  onParseImport,
  onImport,
  onDownloadImportTemplate,
}: SampleInventoryModalLayerProps) {
  return (
    <>
      <SampleFormModal
        open={sampleTarget !== undefined}
        item={sampleTarget ?? null}
        loading={
          actions.createSampleMutation.isPending ||
          actions.updateSampleMutation.isPending
        }
        onCancel={onCloseSample}
        onSubmit={onSubmitSample}
      />
      <AdjustmentModal
        open={adjustTarget !== undefined}
        item={adjustTarget ?? null}
        loading={actions.adjustSampleMutation.isPending}
        onCancel={onCloseAdjustment}
        onSubmit={onSubmitAdjustment}
      />
      <InboundFormModal
        open={inboundOpen}
        samples={samples}
        loading={actions.createInboundMutation.isPending}
        onCancel={onCloseInbound}
        onSubmit={onSubmitInbound}
      />
      <VoidInboundModal
        open={voidInboundTarget !== undefined}
        item={voidInboundTarget ?? null}
        loading={actions.voidInboundMutation.isPending}
        onCancel={onCloseVoidInbound}
        onSubmit={onSubmitVoidInbound}
      />
      <OutboundFormModal
        open={outboundTarget !== undefined}
        item={outboundTarget ?? null}
        samples={samples}
        loading={
          actions.createOutboundMutation.isPending ||
          actions.updateOutboundMutation.isPending
        }
        onCancel={onCloseOutbound}
        onSubmit={onSubmitOutbound}
      />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        loading={actions.settingsMutation.isPending}
        onCancel={onCloseSettings}
        onSubmit={onSubmitSettings}
      />
      <SampleInventoryImportModal
        open={importKind !== null}
        kind={importKind ?? "samples"}
        preview={importPreview}
        parsing={
          actions.parseSampleImportMutation.isPending ||
          actions.parseInboundImportMutation.isPending
        }
        importing={
          actions.importSamplesMutation.isPending ||
          actions.importInboundsMutation.isPending
        }
        onCancel={onCloseImport}
        onParse={onParseImport}
        onImport={onImport}
        onDownloadTemplate={() => onDownloadImportTemplate(importKind ?? "samples")}
      />
    </>
  );
}
