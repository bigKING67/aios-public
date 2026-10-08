import { describe, expect, it } from 'vitest';
import {
  buildEditCheckRequest,
  clipFromSegment,
  clipsFromOriginal,
  editBlocker,
  editProduct,
  loadEditDraft,
  moveClip,
  replaceClip,
  saveEditDraft,
  trimClip,
  type EditSegment,
} from './remix-edit';

function segment(id: string, extra: Partial<EditSegment> = {}): EditSegment {
  return {
    segmentId: id, assetId: 'a-1', assetTitle: '原片', labelKey: 'voice', startMs: 0, endMs: 10_000,
    coverUrl: null, productName: '精华', presetVersion: 1, sourceCurrent: true, ...extra,
  };
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe('单条剪辑 editing rules', () => {
  it('trims only inside the segment and keeps at least one second', () => {
    const seg = segment('s-1', { startMs: 2_000, endMs: 12_000 });
    const clip = clipFromSegment(seg);
    expect(trimClip(clip, seg, [0, 20_000])).toMatchObject({ startMs: 2_000, endMs: 12_000 });
    expect(trimClip(clip, seg, [4_000, 9_000])).toMatchObject({ startMs: 4_000, endMs: 9_000 });
    // Dragging the in-point onto the out-point leaves one second before it.
    expect(trimClip(clip, seg, [11_800, 12_000])).toMatchObject({ startMs: 11_000, endMs: 12_000 });
    // Dragging the out-point onto the in-point leaves one second after it.
    expect(trimClip(clip, seg, [2_000, 2_300])).toMatchObject({ startMs: 2_000, endMs: 3_000 });
  });

  it('moves and replaces clips in place', () => {
    const [a, b, c] = ['s-1', 's-2', 's-3'].map((id) => clipFromSegment(segment(id)));
    expect(moveClip([a, b, c], 0, 1).map((clip) => clip.segmentId)).toEqual(['s-2', 's-1', 's-3']);
    expect(moveClip([a, b, c], 0, -1).map((clip) => clip.segmentId)).toEqual(['s-1', 's-2', 's-3']);
    const replaced = replaceClip([a, b], b.key, segment('s-9', { startMs: 1_000, endMs: 4_000 }));
    expect(replaced[1]).toEqual({ key: b.key, segmentId: 's-9', startMs: 1_000, endMs: 4_000 });
  });

  it('blocks unknown segments, mixed products and out-of-range totals', () => {
    const segments = new Map([
      ['s-1', segment('s-1')],
      ['s-2', segment('s-2', { productName: '面霜' })],
      ['s-3', segment('s-3', { endMs: 2_000 })],
    ]);
    const clip = (id: string) => clipFromSegment(segments.get(id) ?? segment(id));
    expect(editBlocker([], segments, 600)).toMatch('先选一个起点');
    expect(editBlocker([clip('gone')], segments, 600)).toMatch('1 段已不可用');
    expect(editBlocker([clip('s-1'), clip('s-2')], segments, 600)).toMatch('同一产品');
    expect(editBlocker([clip('s-3')], segments, 600)).toMatch('至少 3 秒');
    expect(editBlocker([clip('s-1')], segments, 5)).toMatch('最长 5 秒');
    expect(editBlocker([clip('s-1')], segments, 600)).toBeNull();
    expect(editProduct([clip('gone'), clip('s-2')], segments)).toBe('面霜');
  });

  it('starts from an original in time order with its main product only', () => {
    const segments = [
      segment('late', { startMs: 20_000, endMs: 25_000 }),
      segment('early', { startMs: 0, endMs: 5_000 }),
      segment('other', { startMs: 30_000, endMs: 35_000, productName: '面霜' }),
      segment('elsewhere', { assetId: 'a-2' }),
    ];
    expect(clipsFromOriginal(segments, 'a-1').map((clip) => clip.segmentId)).toEqual(['early', 'late']);
  });

  it('keeps a browser draft per user and preset version and drops the shared legacy draft', () => {
    const storage = memoryStorage();
    const preset = { presetKey: 'framework', version: 2 };
    const clips = [{ ...clipFromSegment(segment('s-1')), startMs: 1_000 }];
    const plain = (items: { segmentId: string; startMs: number; endMs: number }[]) =>
      items.map(({ segmentId, startMs, endMs }) => ({ segmentId, startMs, endMs }));
    saveEditDraft(preset, 'u-1', clips, storage);
    expect(plain(loadEditDraft(preset, 'u-1', storage))).toEqual([{ segmentId: 's-1', startMs: 1_000, endMs: 10_000 }]);
    // Another account on the same browser, another preset version, or no user: nothing.
    expect(loadEditDraft(preset, 'u-2', storage)).toEqual([]);
    expect(loadEditDraft({ presetKey: 'framework', version: 1 }, 'u-1', storage)).toEqual([]);
    // Visiting another preset version (load empty, then save empty) leaves this draft alone.
    saveEditDraft({ presetKey: 'framework', version: 1 }, 'u-1', [], storage);
    expect(loadEditDraft(preset, 'u-1', storage)).toHaveLength(1);
    expect(loadEditDraft(preset, null, storage)).toEqual([]);
    saveEditDraft(preset, null, clips, storage);
    expect(storage.length).toBe(1);
    expect(buildEditCheckRequest(preset, clips)).toEqual({
      presetKey: 'framework', presetVersion: 2, clips: [{ segmentId: 's-1', startMs: 1_000, endMs: 10_000 }],
    });
    saveEditDraft(preset, 'u-1', [], storage);
    expect(loadEditDraft(preset, 'u-1', storage)).toEqual([]);
    storage.setItem('aiStudio.singleEditDraft.v3:u-1:framework:2', '{broken');
    expect(loadEditDraft(preset, 'u-1', storage)).toEqual([]);
    storage.setItem('aiStudio.singleEditDraft.v1', '{}');
    storage.setItem('aiStudio.singleEditDraft.v2:u-1', '{}');
    loadEditDraft(preset, 'u-1', storage);
    expect(storage.getItem('aiStudio.singleEditDraft.v1')).toBeNull();
    expect(storage.getItem('aiStudio.singleEditDraft.v2:u-1')).toBeNull();
  });
});
