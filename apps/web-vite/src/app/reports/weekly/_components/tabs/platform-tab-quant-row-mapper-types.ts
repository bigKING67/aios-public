export type QuantAttributionItem = {
  factor_key?: unknown;
  factor_label?: unknown;
  curr_value?: unknown;
  prev_value?: unknown;
  change_rate?: unknown;
  ln_contribution?: unknown;
  contribution_value?: unknown;
  contribution_rate?: unknown;
  effect?: unknown;
  reason?: unknown;
  action?: unknown;
  priority?: unknown;
};

export type ChannelQuantAttributionItem = {
  traffic_channel?: unknown;
  quant_attribution?: QuantAttributionItem[];
};
