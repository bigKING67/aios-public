import type { MessageInstance } from 'antd/es/message/interface';
import { DASHBOARD_RANGE_LIMIT_MESSAGE_KEY } from './dashboard-config';

const DEFAULT_OVERVIEW_LOAD_ERROR_MESSAGE = '看板数据加载失败，请检查数据库迁移与 ETL 刷新状态后重试。';
const DEFAULT_LIVE_LOAD_ERROR_MESSAGE = '直播维度数据加载失败，请检查 ADS 直播明细表刷新状态后重试。';
const DEFAULT_LIVE_GOODS_LOAD_ERROR_MESSAGE = '直播商品维度数据加载失败，请检查 ADS 直播商品明细表刷新状态后重试。';
const DEFAULT_SHORT_VIDEO_LOAD_ERROR_MESSAGE = '短视频维度数据加载失败，请检查 ADS 短视频明细表刷新状态后重试。';
const DEFAULT_GOODS_CARD_LOAD_ERROR_MESSAGE = '商品卡维度数据加载失败，请检查 ADS 商品卡主表刷新状态后重试。';
const DEFAULT_GOODS_CARD_TRAFFIC_LOAD_ERROR_MESSAGE =
  '商品卡流量来源数据加载失败，请检查 ADS 商品卡流量来源表刷新状态后重试。';
const DEFAULT_QIANCHUAN_LOAD_ERROR_MESSAGE =
  '千川维度数据加载失败，请检查 ADS 千川直播全域事实表刷新状态后重试。';
const DEFAULT_GOODS_LOAD_ERROR_MESSAGE = '商品经营数据加载失败，请检查 ADS 商品日表刷新状态后重试。';
const DEFAULT_TRAFFIC_LOAD_ERROR_MESSAGE = '流量维度数据加载失败，请检查 ADS 流量日表刷新状态后重试。';
const DEFAULT_TRAFFIC_GOODS_LOAD_ERROR_MESSAGE =
  '商品流量维度数据加载失败，请检查 ADS 商品流量日表刷新状态后重试。';

export function isRequestCanceled(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const maybeError = error as { code?: string; name?: string; message?: string };
    if (maybeError.code === 'ERR_CANCELED' || maybeError.name === 'CanceledError') {
      return true;
    }
    if (typeof maybeError.message === 'string' && maybeError.message.toLowerCase().includes('canceled')) {
      return true;
    }
  }
  return false;
}

export function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message ? message : null;
  }
  if (error && typeof error === 'object') {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === 'string') {
      const message = maybeError.message.trim();
      return message ? message : null;
    }
  }
  return null;
}

export function extractDateRangeLimitErrorMessage(error: unknown): string | null {
  const message = extractErrorMessage(error);
  if (!message) {
    return null;
  }
  return message.includes('日期跨度不能超过') ? message : null;
}

export function showDashboardDateRangeLimitWarning(messageApi: MessageInstance, error: unknown): void {
  const rangeLimitMessage = extractDateRangeLimitErrorMessage(error);
  if (!rangeLimitMessage) {
    return;
  }

  showDashboardRangeLimitWarning(messageApi, rangeLimitMessage);
}

export function showDashboardRangeLimitWarning(messageApi: MessageInstance, content: string): void {
  messageApi.warning({
    key: DASHBOARD_RANGE_LIMIT_MESSAGE_KEY,
    content,
  });
}

export function resolveDashboardExportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `导出失败：${error.message}`;
  }
  return '导出失败：请稍后重试';
}

export function resolveOverviewLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_OVERVIEW_LOAD_ERROR_MESSAGE;
}

export function resolveLiveLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_LIVE_LOAD_ERROR_MESSAGE;
}

export function resolveLiveGoodsLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_LIVE_GOODS_LOAD_ERROR_MESSAGE;
}

export function resolveShortVideoLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_SHORT_VIDEO_LOAD_ERROR_MESSAGE;
}

export function resolveGoodsCardLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_GOODS_CARD_LOAD_ERROR_MESSAGE;
}

export function resolveGoodsCardTrafficLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_GOODS_CARD_TRAFFIC_LOAD_ERROR_MESSAGE;
}

export function resolveQianchuanLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_QIANCHUAN_LOAD_ERROR_MESSAGE;
}

export function resolveGoodsLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_GOODS_LOAD_ERROR_MESSAGE;
}

export function resolveTrafficLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_TRAFFIC_LOAD_ERROR_MESSAGE;
}

export function resolveTrafficGoodsLoadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  return message || DEFAULT_TRAFFIC_GOODS_LOAD_ERROR_MESSAGE;
}
