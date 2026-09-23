import type {
  SampleInventoryInboundQuery,
  SampleInventoryOutboundQuery,
  SampleInventorySampleQuery,
} from "./sample-inventory-types";

export const sampleInventoryQueryKeys = {
  root: ["sample-inventory"] as const,
  settings: () => ["sample-inventory", "settings"] as const,
  summary: () => ["sample-inventory", "summary"] as const,
  samplesRoot: () => ["sample-inventory", "samples"] as const,
  samples: (query: SampleInventorySampleQuery) =>
    ["sample-inventory", "samples", query] as const,
  inboundsRoot: () => ["sample-inventory", "inbounds"] as const,
  inbounds: (query: SampleInventoryInboundQuery) =>
    ["sample-inventory", "inbounds", query] as const,
  outboundsRoot: () => ["sample-inventory", "outbounds"] as const,
  outbounds: (query: SampleInventoryOutboundQuery) =>
    ["sample-inventory", "outbounds", query] as const,
};
