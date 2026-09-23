import type { ChannelQuantReasonAction } from './platform-tab-diagnostic-types';

export function decorateChannelFallbackText(
  text: string | undefined,
  channelLabel: string,
  fallback: string
): string {
  if (typeof text !== 'string') {
    return fallback;
  }
  const normalizedText = text.trim();
  if (!normalizedText || normalizedText === '--') {
    return fallback;
  }
  if (normalizedText.includes(channelLabel)) {
    return normalizedText;
  }
  return `${channelLabel}：${normalizedText}`;
}

export function buildDefaultChannelQuantReasonAndAction(
  channelLabel: string,
  fallbackReason?: string,
  fallbackAction?: string
): ChannelQuantReasonAction {
  return {
    reason: decorateChannelFallbackText(
      fallbackReason,
      channelLabel,
      `${channelLabel}关键指标出现波动，需结合流量与承接链路联合排查。`
    ),
    action: decorateChannelFallbackText(
      fallbackAction,
      channelLabel,
      `先处理${channelLabel}贡献绝对值最大的因子，再逐项验证策略效果。`
    ),
  };
}
