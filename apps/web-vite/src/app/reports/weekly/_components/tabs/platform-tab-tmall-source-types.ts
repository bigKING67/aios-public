import type {
  ChannelAttributionItem,
  ChannelQuantAttributionItem,
  FunnelChannelItem,
  GoodsAttributionItem,
  QuantAttributionItem,
} from './platform-tab-row-mapper-types';

export type AttributionTotalsSource = {
  total_gmv?: unknown;
  total_prev_gmv?: unknown;
};

export type GoodsAttributionSource = AttributionTotalsSource & {
  items?: GoodsAttributionItem[];
};

export type ChannelAttributionSource = {
  items?: ChannelAttributionItem[];
};

export type FunnelSelectedChannelDetailSource = {
  traffic_channel?: unknown;
  gmv_delta?: unknown;
  contribution_rate?: unknown;
};

export type FunnelDiagnosisSource = {
  product_id?: unknown;
  selected_channels?: unknown[];
  selected_channel_details?: FunnelSelectedChannelDetailSource[];
  funnel_items?: FunnelChannelItem[];
  quant_attribution?: QuantAttributionItem[];
  quant_attribution_by_channel?: readonly ChannelQuantAttributionItem[];
};
