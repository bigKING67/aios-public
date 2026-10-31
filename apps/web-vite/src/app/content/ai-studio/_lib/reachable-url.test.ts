import { describe, expect, it } from 'vitest';
import { firstReachable, type Probe } from './reachable-url';

const OUTER = 'https://youmou-sucaiwang.sucaicloud.com:9001/a.mp4';
const INNER = 'https://youmou-sucaiwang-inner.sucaicloud.com/a.mp4';

/** A probe where each url yields metadata or a media error after its delay, and honours abort. */
function probe(plan: Record<string, { ms: number; ok: boolean }>, aborted: string[]): Probe {
  return (url, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => (plan[url].ok ? resolve() : reject(new Error('media error'))), plan[url].ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        aborted.push(url);
        reject(new Error('aborted'));
      });
    });
}

describe('firstReachable', () => {
  it('takes the address whose metadata loads first and aborts the other', async () => {
    const aborted: string[] = [];
    const url = await firstReachable([OUTER, INNER], { probe: probe({ [OUTER]: { ms: 50, ok: true }, [INNER]: { ms: 5, ok: true } }, aborted) });
    expect(url).toBe(INNER);
    expect(aborted).toContain(OUTER);
  });

  it('skips an address that connects but fails to deliver the file (a local proxy stalling it)', async () => {
    const url = await firstReachable([OUTER, INNER], { probe: probe({ [OUTER]: { ms: 1, ok: false }, [INNER]: { ms: 30, ok: true } }, []) });
    expect(url).toBe(INNER);
  });

  it('falls back to the first address when none loads in time', async () => {
    const url = await firstReachable([OUTER, INNER], {
      timeoutMs: 10,
      probe: probe({ [OUTER]: { ms: 1000, ok: true }, [INNER]: { ms: 1000, ok: true } }, []),
    });
    expect(url).toBe(OUTER);
  });

  it('returns a single address without probing', async () => {
    expect(await firstReachable([OUTER], { probe: () => Promise.reject(new Error('never called')) })).toBe(OUTER);
  });
});
