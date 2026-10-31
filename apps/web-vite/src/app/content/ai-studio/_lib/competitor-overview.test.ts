import { describe, expect, it } from 'vitest';
import { readOverview } from './competitor-overview';

describe('competitor overview read model', () => {
  it('reads counts defensively', () => {
    const overview = readOverview({
      current: { analyzed: 13, brands: 7 },
      previous: { analyzed: 6, brands: -1 },
      analyzing: 2,
    });
    expect(overview.current).toEqual({ analyzed: 13, brands: 7 });
    expect(overview.previous).toEqual({ analyzed: 6, brands: 0 });
    expect(overview.analyzing).toBe(2);
    expect(readOverview({ previous: null }).previous).toBeNull();
    expect(readOverview(undefined)).toEqual({ current: { analyzed: 0, brands: 0 }, previous: null, analyzing: 0 });
  });
});
