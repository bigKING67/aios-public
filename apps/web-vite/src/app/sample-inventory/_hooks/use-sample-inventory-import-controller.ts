import { useState } from "react";

import type { SampleInventoryImportPreview } from "../_components/sample-inventory-operation-dialogs";
import type { useSampleInventoryActions } from "./use-sample-inventory-actions";
import { useSampleInventorySubmissionKeys } from "./use-sample-inventory-submission-keys";

type ImportKind = "samples" | "inbounds";

type UseSampleInventoryImportControllerOptions = {
  actions: ReturnType<typeof useSampleInventoryActions>;
  guardWrite: () => boolean;
};

export function useSampleInventoryImportController({
  actions,
  guardWrite,
}: UseSampleInventoryImportControllerOptions) {
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [preview, setPreview] = useState<SampleInventoryImportPreview>();
  const submissionKeys = useSampleInventorySubmissionKeys();

  const open = (nextKind: ImportKind) => {
    if (!guardWrite()) return;
    setPreview(undefined);
    setKind(nextKind);
  };

  const parse = (file: File) => {
    if (!kind || !guardWrite()) return;
    setPreview(undefined);
    const mutation = kind === "samples" ? actions.parseSampleImportMutation : actions.parseInboundImportMutation;
    mutation.mutate(file, {
      onSuccess: (data) =>
        setPreview({
          kind,
          data,
        } as SampleInventoryImportPreview),
    });
  };

  const run = () => {
    if (!preview || preview.data.invalidCount > 0 || !guardWrite()) return;
    if (preview.kind === "samples") {
      const request = { rows: preview.data.rows };
      const { cacheKey, submissionKey } = submissionKeys.acquire("sample-import", request);
      actions.importSamplesMutation.mutate(
        { ...request, submissionKey },
        {
          onSuccess: () => {
            submissionKeys.release(cacheKey);
            setKind(null);
          },
        },
      );
      return;
    }

    const request = { rows: preview.data.rows };
    const { cacheKey, submissionKey } = submissionKeys.acquire("inbound-import", request);
    actions.importInboundsMutation.mutate(
      { ...request, submissionKey },
      {
        onSuccess: () => {
          submissionKeys.release(cacheKey);
          setKind(null);
        },
      },
    );
  };

  return {
    close: () => setKind(null),
    kind,
    open,
    parse,
    preview,
    run,
  };
}
