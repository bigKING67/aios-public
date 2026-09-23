import type { FunnelChannelItem } from './platform-tab-row-mapper-types';

export function resolveFunnelProductId(item: Pick<FunnelChannelItem, 'product_id'>): string {
  return String(item.product_id || '--');
}

export function resolveFunnelProductName(item: Pick<FunnelChannelItem, 'product_name'>): string {
  return String(item.product_name || '(未命名商品)');
}

export function resolveFunnelTrafficChannel(item: Pick<FunnelChannelItem, 'traffic_channel'>): string {
  return String(item.traffic_channel || 'unknown');
}

export function resolveFunnelMetricSource(item: Pick<FunnelChannelItem, 'metric_source'>): string {
  return String(item.metric_source || 'taobao_one');
}

export function resolveFunnelHasClickStage(item: Pick<FunnelChannelItem, 'has_click_stage'>): boolean {
  return item.has_click_stage !== false;
}
