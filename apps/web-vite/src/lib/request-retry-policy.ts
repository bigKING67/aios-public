export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504] as const;

export type RequestRetryMode = 'safe' | 'never' | 'always';

export type RequestRetryPolicyInput = {
  method?: string;
  statusCode: number;
  retryCount: number;
  maxRetries: number;
  retryMode: RequestRetryMode;
};

export function shouldRetryRequest({
  method,
  statusCode,
  retryCount,
  maxRetries,
  retryMode,
}: RequestRetryPolicyInput): boolean {
  if (retryMode === 'never' || retryCount >= maxRetries || maxRetries <= 0) {
    return false;
  }

  const normalizedMethod = method?.trim().toLowerCase();
  const methodAllowsRetry = retryMode === 'always' || normalizedMethod === 'get';
  return (
    methodAllowsRetry &&
    RETRYABLE_STATUS_CODES.some((retryableStatus) => retryableStatus === statusCode)
  );
}
