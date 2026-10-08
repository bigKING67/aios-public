import { describe, expect, it } from 'vitest';
import { validateSegmentDraft } from './segment-form';

const base = { startText: '0:01.0', endText: '0:05.0', labelKey: 'street', durationMs: 60_000 };

describe('segment draft validation', () => {
  it('accepts a valid interval', () => {
    expect(validateSegmentDraft(base)).toEqual({ ok: true, startMs: 1_000, endMs: 5_000 });
  });

  it('requires parseable times and a label', () => {
    const result = validateSegmentDraft({ ...base, startText: 'x', endText: '', labelKey: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['end', 'label', 'start']);
  });

  it('rejects reversed, too short and out-of-range intervals', () => {
    expect(validateSegmentDraft({ ...base, endText: '0:00.5' })).toMatchObject({ ok: false, errors: { end: '出点必须晚于入点' } });
    expect(validateSegmentDraft({ ...base, endText: '0:01.2' })).toMatchObject({ ok: false, errors: { end: '片段至少 0.5 秒' } });
    expect(validateSegmentDraft({ ...base, endText: '1:00.1' })).toMatchObject({ ok: false, errors: { end: '出点超过原片时长' } });
    expect(validateSegmentDraft({ ...base, startText: '1:00.0', endText: '1:02.0' })).toMatchObject({ ok: false });
  });

  it('skips the duration bound when the source duration is unverified', () => {
    expect(validateSegmentDraft({ ...base, endText: '9:00.0', durationMs: null })).toMatchObject({ ok: true, endMs: 540_000 });
  });

  it('keeps untouched millisecond boundaries when editing', () => {
    const original = { startMs: 12_345, endMs: 18_987 };
    expect(validateSegmentDraft({ ...base, startText: '0:12.3', endText: '0:19.0', original })).toEqual({
      ok: true,
      startMs: 12_345,
      endMs: 18_987,
    });
    expect(validateSegmentDraft({ ...base, startText: '0:12.4', endText: '0:19.0', original })).toMatchObject({
      ok: true,
      startMs: 12_400,
      endMs: 18_987,
    });
  });
});
