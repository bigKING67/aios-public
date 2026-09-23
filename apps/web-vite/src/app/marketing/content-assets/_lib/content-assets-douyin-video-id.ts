import { resolveContentAssetDouyinVideoId } from './content-assets-api';
import type { ContentAssetDouyinVideoIdResolveResponse } from './content-assets-types';

const ALLOWED_DOUYIN_HOSTS = new Set(['douyin.com', 'www.douyin.com', 'v.douyin.com']);
const SHORT_DOUYIN_HOST = 'v.douyin.com';
const DOUYIN_URL_PATTERN =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*douyin\.com\/[^\s"'<>，。！？、；：）)】]+/gi;
const WRAPPED_SHORT_DOUYIN_URL_PATTERN =
  /((?:https?:\/\/)?v\.douyin\.com\/)\s+([A-Za-z0-9_-]+\/?)/gi;
const WRAPPED_LONG_DOUYIN_URL_PATTERN =
  /((?:https?:\/\/)?(?:www\.)?douyin\.com\/video\/)\s+(\d+)/gi;

export class ContentAssetDouyinVideoIdInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentAssetDouyinVideoIdInputError';
  }
}

export async function resolveDouyinVideoIdFromInput(
  input: string
): Promise<ContentAssetDouyinVideoIdResolveResponse> {
  const sourceUrl = extractDouyinUrl(input);
  if (!sourceUrl) {
    throw new ContentAssetDouyinVideoIdInputError('请粘贴抖音视频链接或包含抖音链接的分享文案。');
  }

  const parsedUrl = parseDouyinUrl(sourceUrl);
  if (!parsedUrl || !isAllowedDouyinHost(parsedUrl.hostname)) {
    throw new ContentAssetDouyinVideoIdInputError('当前只支持抖音视频链接。');
  }

  const localVideoId = extractDouyinVideoIdFromLongUrl(parsedUrl);
  if (localVideoId) {
    return {
      sourceUrl,
      resolvedUrl: sourceUrl,
      externalVideoId: localVideoId,
    };
  }

  if (parsedUrl.hostname.toLowerCase() === SHORT_DOUYIN_HOST) {
    const response = await resolveContentAssetDouyinVideoId({ input: sourceUrl });
    if (!response.externalVideoId?.trim()) {
      throw new ContentAssetDouyinVideoIdInputError('短链接已解析，但没有返回抖音视频 ID。');
    }
    return response;
  }

  throw new ContentAssetDouyinVideoIdInputError('未能从抖音链接中识别 /video/{数字ID}。');
}

export function resolveDouyinVideoIdErrorMessage(error: unknown): string {
  if (error instanceof ContentAssetDouyinVideoIdInputError) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '提取抖音视频 ID 失败');
  }
  return '提取抖音视频 ID 失败';
}

export function hasSupportedDouyinUrlInput(input: string): boolean {
  const sourceUrl = extractDouyinUrl(input);
  if (!sourceUrl) return false;
  const parsedUrl = parseDouyinUrl(sourceUrl);
  return Boolean(parsedUrl && isAllowedDouyinHost(parsedUrl.hostname));
}

function extractDouyinUrl(input: string): string | null {
  const value = normalizeWrappedDouyinUrls(input);
  if (!value) return null;
  for (const match of value.matchAll(DOUYIN_URL_PATTERN)) {
    const candidate = /^https?:\/\//i.test(match[0]) ? match[0] : `https://${match[0]}`;
    const parsedUrl = parseDouyinUrl(candidate);
    if (parsedUrl && isAllowedDouyinHost(parsedUrl.hostname)) {
      return candidate;
    }
  }
  return null;
}

function normalizeWrappedDouyinUrls(input: string): string {
  return input
    .trim()
    .replace(WRAPPED_SHORT_DOUYIN_URL_PATTERN, '$1$2')
    .replace(WRAPPED_LONG_DOUYIN_URL_PATTERN, '$1$2');
}

function parseDouyinUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedDouyinHost(hostname: string): boolean {
  return ALLOWED_DOUYIN_HOSTS.has(hostname.toLowerCase().replace(/\.$/, ''));
}

function extractDouyinVideoIdFromLongUrl(url: URL): string | null {
  const match = url.pathname.match(/\/video\/(\d+)(?:\/|$)/);
  return match?.[1] || null;
}
