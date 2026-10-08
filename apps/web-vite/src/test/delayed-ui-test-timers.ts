import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

export function installDelayedUiTestTimers() {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(async () => {
    try {
      cleanup();
      // AntD input updates can outlive unmount; drain them before DOM disposal.
      await act(() => vi.runOnlyPendingTimersAsync());
    } finally {
      vi.useRealTimers();
    }
  });
}
