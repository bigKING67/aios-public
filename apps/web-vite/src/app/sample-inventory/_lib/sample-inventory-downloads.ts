import {
  downloadSampleInventoryInboundExport,
  downloadSampleInventoryInboundTemplate,
  downloadSampleInventoryOutboundExport,
  downloadSampleInventorySampleExport,
  downloadSampleInventorySampleTemplate,
} from "./sample-inventory-api";

export type SampleInventoryDownloadKind =
  | "sample-template"
  | "sample-export"
  | "inbound-template"
  | "inbound-export"
  | "outbound-export";

const DOWNLOADS = {
  "sample-template": [
    downloadSampleInventorySampleTemplate,
    "新增样品模板.xlsx",
  ],
  "sample-export": [downloadSampleInventorySampleExport, "样品库存.xlsx"],
  "inbound-template": [
    downloadSampleInventoryInboundTemplate,
    "批量入库模板.xlsx",
  ],
  "inbound-export": [downloadSampleInventoryInboundExport, "样品入库记录.xlsx"],
  "outbound-export": [
    downloadSampleInventoryOutboundExport,
    "样品领用记录.xlsx",
  ],
} as const;

export async function downloadSampleInventoryArtifact(
  kind: SampleInventoryDownloadKind,
): Promise<void> {
  const [loader, filename] = DOWNLOADS[kind];
  const blob = await loader();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
