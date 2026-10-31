import { describe, expect, it } from 'vitest';
import {
  formatClock,
  labelOf,
  linesWithin,
  readCompetitorCard,
  readEvidenceMedia,
  sellingPointCounts,
} from './competitor-card';

const CARD = {
  analysis_status: 'complete',
  summary: '面向油皮先点名脱妆再半脸对比',
  purchase_question: '会不会脱妆？',
  hook: { assessment: 'assessable', speech: '我们中年女人', onscreen_text: null, visual: '涂抹额头', mechanism_ids: ['persona_story'], audio_cues: ['none'], why_keep_watching: '点名痛点', complete_hook_end_sec: 6.6 },
  evidence: [
    { id: 's1', modality: 'speech', time: { kind: 'interval', start_sec: 0, end_sec: 6.6 }, content: '我们中年女人不化高光', quality: 'clear' },
    { id: 'v1', modality: 'visual', time: { kind: 'interval', start_sec: 0, end_sec: 4.8 }, content: '涂抹额头', quality: 'clear' },
  ],
  segments: [
    { id: 'g2', start_sec: 6.6, end_sec: 20, primary_role: 'proof', secondary_roles: [], content_forms: [], summary: '半脸对比', evidence_refs: [], claim_refs: ['c1', 'c1'] },
    { id: 'g1', start_sec: 0, end_sec: 6.6, primary_role: 'attention', secondary_roles: ['choice'], content_forms: ['on_face_demo'], voice_form: 'voiceover', tone: 'chatty', music: 'none', sfx: [], summary: '上脸演示', evidence_refs: ['s1', 'v1', 'missing'], claim_refs: [] },
    { id: 'bad', start_sec: null, end_sec: 3 },
  ],
  claims: [{ id: 'c1', text: '持妆不脱妆', selling_point: 'long_wear', qualifiers: ['出汗'], stated_refs: ['s1'], shown_refs: [], evidence_form: 'verbal_only', support: 'not_shown', limitation: '仅口播' }, { id: 'c2', text: '' }],
  product: { brand: '小树美', name: null, category: 'cream_foundation', evidence_refs: [] },
  dimensions: {
    audiences: { assessment: 'assessable', labels: [{ label: '中年女性', basis: 'stated', evidence_refs: ['s1'] }] },
    trust_cues: { assessment: 'partial', labels: [{ cue: 'kol_endorsement', raw: '博主实测' }] },
    offer_and_cta: { assessment: 'assessable', offers: [{ text: '拍一发二' }], cta: ['buy_now'] },
    sound: { assessment: 'assessable', summary: '聊天式口播' },
  },
  transfer: { methods: ['半脸对比'], brand_dependent: [], we_need: ['真实对比素材'] },
  structure: { path: ['attention', 'proof', 'proof', 'offer'] },
  labels: { roles: { attention: '引起注意', proof: '展示证据' }, selling_points: { long_wear: '持妆（含控油、不脱妆、不暗沉）' }, bogus: 'x' },
};

describe('readCompetitorCard', () => {
  it('reads segments in time order and drops malformed rows', () => {
    const card = readCompetitorCard(CARD)!;
    expect(card.segments.map((segment) => segment.id)).toEqual(['g1', 'g2']);
    expect(card.segments[1].claimRefs).toEqual(['c1']);
    expect(card.claims.map((claim) => claim.id)).toEqual(['c1']);
    expect(card.hook?.audioCues).toEqual([]);
    expect(card.product).toEqual({ brand: '小树美', name: null, category: 'cream_foundation' });
    expect(card.trustCues?.labels).toEqual([{ text: '博主实测', kind: 'kol_endorsement' }]);
    expect(card.scenes).toBeNull();
    expect(card.offers).toEqual({ assessment: 'assessable', offers: ['拍一发二'], cta: ['buy_now'] });
    expect(card.labels.bogus).toBeUndefined();
  });

  it('returns null for a missing card and tolerates an empty one', () => {
    expect(readCompetitorCard(null)).toBeNull();
    expect(readCompetitorCard([])).toBeNull();
    const empty = readCompetitorCard({})!;
    expect(empty.segments).toEqual([]);
    expect(empty.transfer).toEqual({ methods: [], brandDependent: [], weNeed: [] });
  });

  it('has no framework on cards written before the structure step', () => {
    expect(readCompetitorCard(CARD)!.framework).toBeNull();
  });
});

describe('labels and formatting', () => {
  const labels = readCompetitorCard(CARD)!.labels;

  it('shows the short label, falling back to the key', () => {
    expect(labelOf(labels, 'roles', 'proof')).toBe('展示证据');
    expect(labelOf(labels, 'selling_points', 'long_wear')).toBe('持妆');
    expect(labelOf(labels, 'roles', 'offer')).toBe('offer');
    expect(labelOf(labels, 'roles', null)).toBe('--');
  });

  it('formats a Douyin-style clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(6.6)).toBe('0:06.6');
    expect(formatClock(59.96)).toBe('1:00');
    expect(formatClock(128.6)).toBe('2:08.6');
    expect(formatClock(null)).toBe('--');
  });
});

describe('evidence media', () => {
  it('keeps signed items and matches frames to segment starts', () => {
    const media = readEvidenceMedia([
      { kind: 'frame', startMs: 6600, endMs: 6600, url: 'https://f/2.webp' },
      { kind: 'clip', startMs: 0, endMs: 10000, url: 'https://f/clip.mp4' },
      { kind: 'frame', startMs: 0, endMs: 0, url: 'https://f/1.webp' },
      { kind: 'frame', startMs: 9000, endMs: 9000 },
    ]);
    expect(media.clip?.url).toBe('https://f/clip.mp4');
    expect(media.frames.map((frame) => frame.url)).toEqual(['https://f/1.webp', 'https://f/2.webp']);
    expect(media.samples).toEqual([]);
    expect(readEvidenceMedia('nope')).toEqual({ clip: null, frames: [], samples: [] });
  });
});

describe('framework structure', () => {
  const FRAMEWORK = {
    status: 'ok',
    labels: { framework: { live_demo: '实拍内容', mixed_voiceover: '混剪口播' }, sellingPoint: { moisturizing: '滋润保湿', no_caking: '妆效', long_wear: '持妆' } },
    segments: [
      { startMs: 8000, endMs: 20000, labelKey: 'mixed_voiceover' },
      { startMs: 0, endMs: 8000, labelKey: 'live_demo' },
      { startMs: 5, endMs: 5, labelKey: 'live_demo' },
    ],
    sellingPoints: [
      { startMs: 12000, endMs: 15000, labelKeys: ['long_wear', 'no_caking'], segmentIndex: 1, quote: '一整天不晕' },
      { startMs: 9000, endMs: 12000, labelKeys: ['no_caking'], segmentIndex: 1, quote: '不结块' },
      { startMs: 1, endMs: 2, labelKeys: [] },
    ],
    transcript: [[9000, 12000, '这个睫毛膏不结块'], [0, 2000, '开场'], [3, 'x'], [12000, 15000, '  ']],
  };

  it('reads segments, selling points and transcript in time order, dropping malformed rows', () => {
    const framework = readCompetitorCard({ ...CARD, framework: FRAMEWORK })!.framework!;
    expect(framework.status).toBe('ok');
    expect(framework.segments.map((segment) => segment.labelKey)).toEqual(['live_demo', 'mixed_voiceover']);
    expect(framework.sellingPoints.map((point) => point.quote)).toEqual(['不结块', '一整天不晕']);
    expect(framework.transcript).toEqual([
      { startMs: 0, endMs: 2000, text: '开场' },
      { startMs: 9000, endMs: 12000, text: '这个睫毛膏不结块' },
    ]);
    expect(readCompetitorCard({ framework: { reason: 'x' } })!.framework!.status).toBe('failed');
  });

  it('orders labels by the stored preset order, else the framework preset order', () => {
    const stored = readCompetitorCard({ framework: { ...FRAMEWORK, labelOrder: { framework: ['mixed_voiceover', 'live_demo'], sellingPoint: ['long_wear', 'no_caking'] } } })!.framework!;
    expect(stored.labelOrder).toEqual({ framework: ['mixed_voiceover', 'live_demo'], sellingPoint: ['long_wear', 'no_caking'] });
    const legacy = readCompetitorCard({ framework: FRAMEWORK })!.framework!;
    expect(legacy.labelOrder.framework).toEqual(['mixed_voiceover', 'live_demo']);
    expect(legacy.labelOrder.sellingPoint).toEqual(['moisturizing', 'no_caking', 'long_wear']);
  });

  it('counts selling points, most first then in preset order', () => {
    const framework = readCompetitorCard({ framework: FRAMEWORK })!.framework!;
    expect(sellingPointCounts(framework)).toEqual([
      { key: 'no_caking', name: '妆效', count: 2 },
      { key: 'long_wear', name: '持妆', count: 1 },
    ]);
  });

  it('finds the script inside a span and orders samples by time', () => {
    const lines = readCompetitorCard({ framework: FRAMEWORK })!.framework!.transcript;
    expect(linesWithin(lines, 8000, 20000).map((line) => line.text)).toEqual(['这个睫毛膏不结块']);
    expect(linesWithin(lines, 1000, 9500)).toHaveLength(2);
    const samples = readEvidenceMedia([
      { kind: 'sample', startMs: 5000, endMs: 5000, url: 'https://f/s2.webp' },
      { kind: 'sample', startMs: 1000, endMs: 1000, url: 'https://f/s1.webp' },
    ]).samples;
    expect(samples.map((sample) => sample.url)).toEqual(['https://f/s1.webp', 'https://f/s2.webp']);
  });
});
