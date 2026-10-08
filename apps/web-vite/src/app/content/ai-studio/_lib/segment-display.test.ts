import { describe, expect, it } from 'vitest';
import type { StudioSegmentPreset } from './ai-studio-api';
import { isSegmentReadOnly, LABEL_TONE_SERIES, labelToneSeries, pickDefaultPreset, presetDisplayName, readAiSegmentEvidence } from './segment-display';

function preset(presetKey: string, version: number, status = 'active'): StudioSegmentPreset {
  return { presetKey, version, status, dimension: 'framework', name: presetKey, labels: [{ key: 'a', name: 'A', definition: '' }, { key: 'b', name: 'B', definition: '' }] };
}

describe('segment display helpers', () => {
  it('picks the newest active framework preset by default', () => {
    expect(pickDefaultPreset([preset('picture', 3), preset('framework', 1), preset('framework', 2, 'retired')])).toMatchObject({ presetKey: 'framework', version: 1 });
    expect(pickDefaultPreset([preset('picture', 1), preset('picture', 2)])).toMatchObject({ version: 2 });
    expect(pickDefaultPreset([])).toBeNull();
  });

  it('treats stale or moved sources as read-only', () => {
    expect(isSegmentReadOnly({ status: 'stale', sourceCurrent: true })).toBe(true);
    expect(isSegmentReadOnly({ status: 'confirmed', sourceCurrent: false })).toBe(true);
    expect(isSegmentReadOnly({ status: 'suggested', sourceCurrent: true })).toBe(false);
  });

  it('maps labels onto stable, pairwise distinct chart tones', () => {
    const framework: StudioSegmentPreset = {
      ...preset('framework', 1),
      labels: ['mixed_voiceover', 'live_demo', 'street_interview', 'promotion', 'koc'].map((key) => ({ key, name: key, definition: '' })),
    };
    const tones = framework.labels.map((label) => labelToneSeries(framework, label.key));
    expect(tones).toEqual([1, 6, 2, 5, 4]);
    expect(new Set(tones).size).toBe(5);
    // Series 3 is visually the same cobalt as series 1 and is never used.
    expect(LABEL_TONE_SERIES).not.toContain(3);
    expect(labelToneSeries(framework, 'mixed_voiceover')).not.toBe(labelToneSeries(framework, 'street_interview'));
    expect(labelToneSeries(framework, 'unknown')).toBe('muted');
    expect(labelToneSeries(undefined, 'koc')).toBe('muted');
  });

  it('shows the preset version once', () => {
    expect(presetDisplayName({ name: '框架 v1', version: 1 })).toBe('框架 · v1');
    expect(presetDisplayName({ name: '框架', version: 2 })).toBe('框架 · v2');
    expect(presetDisplayName({ name: '框架 v1', version: 2 })).toBe('框架 v1 · v2');
    expect(presetDisplayName({ name: 'Remixv1', version: 1 })).toBe('Remixv1 · v1');
  });
});

describe('AI segment evidence', () => {
  it('reads model confidence and reason only for AI segments', () => {
    expect(readAiSegmentEvidence({ origin: 'ai', evidence: { confidence: 0.82, reason: ' 快切口播 ', model: 'm' } }))
      .toEqual({ confidence: 0.82, reason: '快切口播' });
    expect(readAiSegmentEvidence({ origin: 'ai', evidence: { confidence: 1.5, reason: '' } })).toBeNull();
    expect(readAiSegmentEvidence({ origin: 'ai', evidence: { confidence: 'high', reason: '依据' } }))
      .toEqual({ confidence: null, reason: '依据' });
    expect(readAiSegmentEvidence({ origin: 'ai', evidence: null })).toBeNull();
    expect(readAiSegmentEvidence({ origin: 'ai', evidence: [] })).toBeNull();
    expect(readAiSegmentEvidence({ origin: 'human', evidence: { confidence: 0.9, reason: 'x' } })).toBeNull();
  });
});
