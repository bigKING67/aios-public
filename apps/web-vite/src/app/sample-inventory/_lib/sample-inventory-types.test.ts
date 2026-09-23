import { describe, expect, it } from 'vitest';

import {
  isOutboundStatus,
  isSampleInventoryProductKind,
  isSampleInventoryTab,
  normalizeSampleInventoryPageSize,
  normalizeOutboundStatus,
} from './sample-inventory-types';

describe('sample inventory route and status boundaries', () => {
  it('accepts only documented URL tabs and outbound statuses', () => {
    expect(isSampleInventoryTab('outbound-records')).toBe(true);
    expect(isSampleInventoryTab('analytics')).toBe(false);
    expect(isOutboundStatus('approved')).toBe(true);
    expect(isOutboundStatus('done')).toBe(false);
  });

  it('fails closed when the backend returns an unknown status', () => {
    expect(() => normalizeOutboundStatus('done')).toThrow(
      'Unsupported sample inventory outbound status: done'
    );
  });

  it('accepts only documented product kinds and table page sizes', () => {
    expect(isSampleInventoryProductKind('primary')).toBe(true);
    expect(isSampleInventoryProductKind('bundle')).toBe(false);
    expect(normalizeSampleInventoryPageSize('50')).toBe(50);
    expect(normalizeSampleInventoryPageSize('25')).toBe(20);
  });
});
