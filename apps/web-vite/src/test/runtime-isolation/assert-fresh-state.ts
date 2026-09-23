import { createRequire } from 'node:module';
import { expect } from 'vitest';

const nativeState = createRequire(import.meta.url)('./native-state.json') as { visits: number };

const state = { visits: 0 };

export function assertFreshRuntimeState() {
  const runtime = globalThis as typeof globalThis & { aiosIsolationProbe?: boolean };
  expect(runtime.aiosIsolationProbe).toBeUndefined();
  expect(globalThis.document.querySelector('[data-aios-isolation]')).toBeNull();
  expect(globalThis.localStorage.getItem('aios-isolation')).toBeNull();
  expect(++state.visits).toBe(1);
  expect(++nativeState.visits).toBe(1);
  // Deliberately omit cleanup: the next file must get a fresh runtime, not our state.
  runtime.aiosIsolationProbe = true;
  globalThis.document.body.innerHTML = '<div data-aios-isolation="true"></div>';
  globalThis.localStorage.setItem('aios-isolation', 'left by another test file');
}
