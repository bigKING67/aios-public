import { useRef, useState, type ChangeEvent } from "react";
import type { MessageInstance } from "antd/es/message/interface";

import { resolveClientErrorMessage, resolveClientErrorStatus } from "@/lib/client-error";
import type { SampleInventoryBackupFile, SampleInventoryBackupPlanResponse } from "@/lib/generated-api-contract";
import type { SampleInventoryDownloadKind } from "../_lib/sample-inventory-downloads";
import { downloadSampleInventoryArtifact } from "../_lib/sample-inventory-downloads";
import type { useSampleInventoryActions } from "./use-sample-inventory-actions";

const MAX_BACKUP_FILE_BYTES = 8 * 1024 * 1024;

function downloadBackupFile(backup: SampleInventoryBackupFile): void {
  const date = new Date();
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `样品库存_${day}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type UseSampleInventoryBackupControllerOptions = {
  actions: ReturnType<typeof useSampleInventoryActions>;
  guardWrite: () => boolean;
  messageApi: MessageInstance;
  onReadOnlyDetected: () => void;
};

export function useSampleInventoryBackupController({
  actions,
  guardWrite,
  messageApi,
  onReadOnlyDetected,
}: UseSampleInventoryBackupControllerOptions) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [file, setFile] = useState<SampleInventoryBackupFile>();
  const [preview, setPreview] = useState<SampleInventoryBackupPlanResponse>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreSubmissionKeyRef = useRef<string | undefined>(undefined);

  const download = async (kind: SampleInventoryDownloadKind) => {
    try {
      await downloadSampleInventoryArtifact(kind);
    } catch (error) {
      if (resolveClientErrorStatus(error) === 503) onReadOnlyDetected();
      messageApi.error(resolveClientErrorMessage(error, "下载失败"));
    }
  };

  const downloadBackup = () => {
    actions.exportBackupMutation.mutate(undefined, {
      onSuccess: downloadBackupFile,
    });
  };

  const resetRestore = () => {
    setRestoreOpen(false);
    setFile(undefined);
    setPreview(undefined);
    restoreSubmissionKeyRef.current = undefined;
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selectedFile) return;
    if (selectedFile.size === 0 || selectedFile.size > MAX_BACKUP_FILE_BYTES) {
      messageApi.error("备份文件必须大于 0 且不超过 8 MiB");
      return;
    }

    void selectedFile
      .text()
      .then((content) => JSON.parse(content) as SampleInventoryBackupFile)
      .then((parsed) => {
        setFile(parsed);
        setPreview(undefined);
        setRestoreOpen(true);
        restoreSubmissionKeyRef.current = `backup-restore-${crypto.randomUUID()}`;
        actions.parseBackupMutation.mutate(
          { backup: parsed },
          {
            onSuccess: setPreview,
            onError: resetRestore,
          },
        );
      })
      .catch(() => messageApi.error("备份文件不是有效的 JSON"));
  };

  const openRestoreFile = () => {
    if (guardWrite()) fileInputRef.current?.click();
  };

  const restore = () => {
    if (!file || !preview || !guardWrite()) return;
    const submissionKey = restoreSubmissionKeyRef.current ?? `backup-restore-${crypto.randomUUID()}`;
    restoreSubmissionKeyRef.current = submissionKey;
    actions.restoreBackupMutation.mutate(
      {
        submissionKey,
        expectedBackupSha256: preview.backupSha256,
        expectedCurrentStateSha256: preview.currentStateSha256,
        expectedPlanSha256: preview.planSha256,
        backup: file,
      },
      { onSuccess: resetRestore },
    );
  };

  return {
    download,
    downloadBackup,
    fileInputRef,
    hasSelectedFile: Boolean(file),
    openRestoreFile,
    preview,
    resetRestore,
    restore,
    restoreOpen,
    selectFile,
  };
}
