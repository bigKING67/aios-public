import { useRef, useState } from "react";

import type {
  CreateSampleInventoryInboundItem,
  CreateSampleInventoryOutboundBatchRequest,
  SampleInventoryInbound,
  SampleInventoryOutbound,
  SampleInventorySample,
  SampleInventorySettings,
} from "@/lib/generated-api-contract";
import type { AdjustmentFormValues } from "../_components/sample-inventory-adjustment-dialog";
import type {
  InboundFormValues,
  OutboundFormValues,
  SampleFormValues,
} from "../_components/sample-inventory-dialogs";
import type { SettingsFormValues, VoidInboundFormValues } from "../_components/sample-inventory-operation-dialogs";
import { normalizeSampleInventoryOptionalText as optionalText } from "../_lib/sample-inventory-formatters";
import type { SampleInventoryOutboundStatus, SampleInventoryOutboundView } from "../_lib/sample-inventory-types";
import type { useSampleInventoryActions } from "./use-sample-inventory-actions";
import { useSampleInventorySubmissionKeys } from "./use-sample-inventory-submission-keys";

type UseSampleInventoryOperationControllerOptions = {
  actions: ReturnType<typeof useSampleInventoryActions>;
  guardWrite: () => boolean;
  settings?: SampleInventorySettings;
};

export function useSampleInventoryOperationController({
  actions,
  guardWrite,
  settings,
}: UseSampleInventoryOperationControllerOptions) {
  const submissionKeys = useSampleInventorySubmissionKeys();
  const [sampleTarget, setSampleTarget] = useState<SampleInventorySample | null>();
  const [adjustTarget, setAdjustTarget] = useState<SampleInventorySample | null>();
  const [inboundOpen, setInboundOpen] = useState(false);
  const [batchInboundOpen, setBatchInboundOpen] = useState(false);
  const [voidInboundTarget, setVoidInboundTarget] = useState<SampleInventoryInbound | null>();
  const [outboundTarget, setOutboundTarget] = useState<SampleInventoryOutbound | null>();
  const [trackingTarget, setTrackingTarget] = useState<SampleInventoryOutboundView | null>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const batchInboundSubmissionRef = useRef<{ fingerprint: string; submissionKey: string } | undefined>(undefined);
  const trackingSubmissionRef = useRef<{ fingerprint: string; submissionKey: string } | undefined>(undefined);
  const submissionKeyFor = submissionKeys.acquire;
  const clearSubmissionKey = submissionKeys.release;

  const submitSample = (values: SampleFormValues) => {
    if (!guardWrite()) return;
    const common = {
      sampleCode: values.sampleCode.trim(),
      sampleName: values.sampleName.trim(),
      model: optionalText(values.model),
      category: optionalText(values.category),
      remark: optionalText(values.remark),
      reservedQuantity: values.reservedQuantity ?? 0,
    };
    if (sampleTarget) {
      const updateFields = { ...common, location: sampleTarget.location };
      const request = { sampleId: sampleTarget.id, expectedVersion: sampleTarget.version, ...updateFields };
      const { cacheKey, submissionKey } = submissionKeyFor("sample-update", request);
      actions.updateSampleMutation.mutate(
        {
          sampleId: sampleTarget.id,
          payload: { ...updateFields, submissionKey, expectedVersion: sampleTarget.version },
        },
        {
          onSuccess: () => {
            clearSubmissionKey(cacheKey);
            setSampleTarget(undefined);
          },
        },
      );
      return;
    }
    const request = { ...common, location: undefined, initialQuantity: values.initialQuantity ?? 0 };
    const { cacheKey, submissionKey } = submissionKeyFor("sample-create", request);
    actions.createSampleMutation.mutate(
      { ...request, submissionKey },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setSampleTarget(undefined);
        },
      },
    );
  };

  const submitAdjustment = (values: AdjustmentFormValues) => {
    if (!adjustTarget || !guardWrite()) return;
    const request = {
      sampleId: adjustTarget.id,
      quantityDelta: values.quantityDelta,
      reason: values.reason.trim(),
      expectedVersion: adjustTarget.version,
    };
    const { cacheKey, submissionKey } = submissionKeyFor("sample-adjust", request);
    actions.adjustSampleMutation.mutate(
      {
        sampleId: adjustTarget.id,
        payload: {
          ...values,
          submissionKey,
          reason: values.reason.trim(),
          expectedVersion: adjustTarget.version,
        },
      },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setAdjustTarget(undefined);
        },
      },
    );
  };

  const submitInbound = (values: InboundFormValues) => {
    if (!guardWrite()) return;
    const request = {
      sampleId: values.sampleId,
      quantity: values.quantity,
      trackingNumber: optionalText(values.trackingNumber),
      operatorName: optionalText(values.operatorName),
      remark: optionalText(values.remark),
    };
    const { cacheKey, submissionKey } = submissionKeyFor("inbound-create", request);
    actions.createInboundMutation.mutate(
      { ...request, submissionKey },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setInboundOpen(false);
        },
      },
    );
  };

  const submitVoidInbound = (values: VoidInboundFormValues) => {
    if (!voidInboundTarget || !guardWrite()) return;
    const request = {
      inboundId: voidInboundTarget.id,
      expectedVersion: voidInboundTarget.version,
      reason: values.reason.trim(),
    };
    const { cacheKey, submissionKey } = submissionKeyFor("inbound-void", request);
    actions.voidInboundMutation.mutate(
      {
        inboundId: voidInboundTarget.id,
        payload: {
          submissionKey,
          expectedVersion: voidInboundTarget.version,
          reason: values.reason.trim(),
        },
      },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setVoidInboundTarget(undefined);
        },
      },
    );
  };

  const submitOutbound = (values: OutboundFormValues) => {
    if (!guardWrite()) return;
    const payload = {
      sampleId: values.sampleId,
      quantity: values.quantity,
      applicant: values.applicant.trim(),
      department: values.department.trim(),
      purpose: values.purpose.trim(),
      receiver: values.receiver.trim(),
      shippingAddress: values.shippingAddress.trim(),
      trackingNumber: optionalText(values.trackingNumber),
    };
    if (outboundTarget) {
      const request = { requestId: outboundTarget.id, expectedVersion: outboundTarget.version, ...payload };
      const { cacheKey, submissionKey } = submissionKeyFor("outbound-update", request);
      actions.updateOutboundMutation.mutate(
        {
          requestId: outboundTarget.id,
          payload: { ...payload, submissionKey, expectedVersion: outboundTarget.version },
        },
        {
          onSuccess: () => {
            clearSubmissionKey(cacheKey);
            setOutboundTarget(undefined);
          },
        },
      );
      return;
    }
    const { cacheKey, submissionKey } = submissionKeyFor("outbound-create", payload);
    actions.createOutboundMutation.mutate(
      { ...payload, submissionKey },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setOutboundTarget(undefined);
        },
      },
    );
  };

  const transitionOutbound = (item: SampleInventoryOutboundView, targetStatus: SampleInventoryOutboundStatus) => {
    if (!guardWrite()) return;
    const request = { requestId: item.id, expectedVersion: item.version, targetStatus };
    const { cacheKey, submissionKey } = submissionKeyFor("outbound-transition", request);
    actions.transitionOutboundMutation.mutate(
      {
        requestId: item.id,
        payload: { submissionKey, expectedVersion: item.version, targetStatus },
      },
      { onSuccess: () => clearSubmissionKey(cacheKey) },
    );
  };

  const submitTrackingNumber = (trackingNumber: string) => {
    if (!trackingTarget || !guardWrite()) return;
    const normalizedTrackingNumber = trackingNumber.trim();
    if (!normalizedTrackingNumber) return;
    const fingerprint = `${trackingTarget.id}@${trackingTarget.version}:${normalizedTrackingNumber}`;
    if (trackingSubmissionRef.current?.fingerprint !== fingerprint) {
      trackingSubmissionRef.current = {
        fingerprint,
        submissionKey: `outbound-tracking-${crypto.randomUUID()}`,
      };
    }
    actions.updateOutboundTrackingMutation.mutate(
      {
        requestId: trackingTarget.id,
        payload: {
          submissionKey: trackingSubmissionRef.current.submissionKey,
          expectedVersion: trackingTarget.version,
          trackingNumber: normalizedTrackingNumber,
        },
      },
      {
        onSuccess: () => {
          trackingSubmissionRef.current = undefined;
          setTrackingTarget(undefined);
        },
      },
    );
  };

  const submitSettings = (values: SettingsFormValues) => {
    if (!settings || !guardWrite()) return;
    const request = {
      lowStockThreshold: values.lowStockThreshold,
      expectedVersion: settings.version,
    };
    const { cacheKey, submissionKey } = submissionKeyFor("settings-update", request);
    actions.settingsMutation.mutate(
      { ...request, submissionKey },
      {
        onSuccess: () => {
          clearSubmissionKey(cacheKey);
          setSettingsOpen(false);
        },
      },
    );
  };

  const submitBatchInbound = async (items: CreateSampleInventoryInboundItem[]) => {
    if (!guardWrite()) throw new Error("sample inventory is read-only");
    const fingerprint = JSON.stringify(items);
    if (batchInboundSubmissionRef.current?.fingerprint !== fingerprint) {
      batchInboundSubmissionRef.current = {
        fingerprint,
        submissionKey: `inbound-create-${crypto.randomUUID()}`,
      };
    }
    await actions.createInboundBatchMutation.mutateAsync({
      submissionKey: batchInboundSubmissionRef.current.submissionKey,
      items,
    });
    batchInboundSubmissionRef.current = undefined;
    setBatchInboundOpen(false);
  };

  const createOutboundBatch = async (payload: CreateSampleInventoryOutboundBatchRequest) => {
    if (!guardWrite()) throw new Error("sample inventory is read-only");
    await actions.createOutboundBatchMutation.mutateAsync(payload);
  };

  const createInboundInline = async (payload: CreateSampleInventoryInboundItem) => {
    if (!guardWrite()) throw new Error("sample inventory is read-only");
    const { cacheKey, submissionKey } = submissionKeyFor("inbound-create-inline", payload);
    await actions.createInboundMutation.mutateAsync({ ...payload, submissionKey });
    clearSubmissionKey(cacheKey);
  };

  const archiveSample = (item: SampleInventorySample) => {
    if (!guardWrite()) return;
    const request = { sampleId: item.id, expectedVersion: item.version };
    const { cacheKey, submissionKey } = submissionKeyFor("sample-archive", request);
    actions.archiveSampleMutation.mutate(
      {
        sampleId: item.id,
        payload: { submissionKey, expectedVersion: item.version },
      },
      { onSuccess: () => clearSubmissionKey(cacheKey) },
    );
  };

  return {
    adjustTarget,
    archiveSample,
    batchInboundOpen,
    cancelBatchInbound: () => {
      if (!actions.createInboundBatchMutation.isPending) {
        batchInboundSubmissionRef.current = undefined;
        setBatchInboundOpen(false);
      }
    },
    cancelTracking: () => {
      if (!actions.updateOutboundTrackingMutation.isPending) {
        trackingSubmissionRef.current = undefined;
        setTrackingTarget(undefined);
      }
    },
    closeAdjustment: () => setAdjustTarget(undefined),
    closeInbound: () => setInboundOpen(false),
    closeOutbound: () => setOutboundTarget(undefined),
    closeSample: () => setSampleTarget(undefined),
    closeSettings: () => setSettingsOpen(false),
    closeVoidInbound: () => setVoidInboundTarget(undefined),
    createInboundInline,
    createOutboundBatch,
    inboundOpen,
    openAdjustment: (item: SampleInventorySample) => guardWrite() && setAdjustTarget(item),
    openBatchInbound: () => guardWrite() && setBatchInboundOpen(true),
    openOutbound: (item?: SampleInventoryOutboundView) => guardWrite() && setOutboundTarget(item ?? null),
    openSample: (item?: SampleInventorySample) => guardWrite() && setSampleTarget(item ?? null),
    openSettings: () => setSettingsOpen(true),
    openTracking: (item: SampleInventoryOutboundView) => {
      if (!guardWrite()) return;
      trackingSubmissionRef.current = undefined;
      setTrackingTarget(item);
    },
    openVoidInbound: (item: SampleInventoryInbound) => guardWrite() && setVoidInboundTarget(item),
    outboundTarget,
    sampleTarget,
    settingsOpen,
    submitAdjustment,
    submitBatchInbound,
    submitInbound,
    submitOutbound,
    submitSample,
    submitSettings,
    submitTrackingNumber,
    submitVoidInbound,
    trackingTarget,
    transitionOutbound,
    voidInboundTarget,
  };
}
