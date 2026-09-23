import { describe, expect, it } from 'vitest';

import { shouldRetryRequest } from '@/lib/request-retry-policy';

describe('shouldRetryRequest', () => {
  it('retries safe GET requests only for transient status codes', () => {
    expect(shouldRetryRequest({
      maxRetries: 2,
      method: ' GET ',
      retryCount: 0,
      retryMode: 'safe',
      statusCode: 503,
    })).toBe(true);
    expect(shouldRetryRequest({
      maxRetries: 2,
      method: 'GET',
      retryCount: 0,
      retryMode: 'safe',
      statusCode: 400,
    })).toBe(false);
  });

  it('does not retry unsafe methods unless always mode is explicit', () => {
    expect(shouldRetryRequest({
      maxRetries: 2,
      method: 'POST',
      retryCount: 0,
      retryMode: 'safe',
      statusCode: 503,
    })).toBe(false);
    expect(shouldRetryRequest({
      maxRetries: 2,
      method: 'POST',
      retryCount: 0,
      retryMode: 'always',
      statusCode: 503,
    })).toBe(true);
  });

  it('honors retry limits and never mode', () => {
    expect(shouldRetryRequest({
      maxRetries: 1,
      method: 'GET',
      retryCount: 1,
      retryMode: 'safe',
      statusCode: 429,
    })).toBe(false);
    expect(shouldRetryRequest({
      maxRetries: 3,
      method: 'GET',
      retryCount: 0,
      retryMode: 'never',
      statusCode: 503,
    })).toBe(false);
  });
});
