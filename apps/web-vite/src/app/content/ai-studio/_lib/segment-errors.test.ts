import { describe, expect, it } from 'vitest';
import { APIError, RequestTransportError } from '@/lib/request';
import { describeSegmentMutationError } from './segment-errors';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
/** A 409 as the request layer builds it: detail text plus the raw response body. */
function conflict(detail: string, data: unknown) {
  const config = { method: 'patch' as const, url: '/x', baseURL: '', headers: {} };
  const transport = new RequestTransportError('conflict', 'ERR_BAD_RESPONSE', config, {
    data, status: 409, statusText: 'Conflict', headers: {}, config,
  });
  return new APIError('CONFLICT', 409, detail, transport);
}

const lookup = [{ segmentId: A, startMs: 10_000, endMs: 20_000, labelName: '街采' }];

describe('segment mutation errors', () => {
  it('extracts overlap IDs and names the visible conflicting segment', () => {
    const result = describeSegmentMutationError(new APIError('CONFLICT', 409, `与已确认片段时间重叠：${A},${B}`), lookup);
    expect(result.kind).toBe('overlap');
    expect(result.segmentIds).toEqual([A, B]);
    expect(result.message).toContain('街采 0:10.0–0:20.0');
  });

  it('prefers the structured code and segment ids over the detail text', () => {
    const upper = A.toUpperCase();
    const result = describeSegmentMutationError(
      conflict('片段已被修改，请刷新后重试', { detail: '片段已被修改', code: 'segment_overlap', segmentIds: [upper, A] }),
      lookup,
    );
    expect(result).toMatchObject({ kind: 'overlap', segmentIds: [A] });
    expect(result.message).toContain('街采 0:10.0–0:20.0');
    expect(describeSegmentMutationError(conflict(`与已确认片段时间重叠：${B}`, { code: 'revision_conflict', segmentIds: [A] })))
      .toMatchObject({ kind: 'revision', segmentIds: [A] });
    expect(describeSegmentMutationError(conflict('x', { code: 'source_changed', segmentIds: [] })))
      .toMatchObject({ kind: 'stale', segmentIds: [] });
    expect(describeSegmentMutationError(conflict('x', { code: 'stale_segment', segmentIds: [B] })))
      .toMatchObject({ kind: 'stale', segmentIds: [B] });
  });

  it('falls back to text parsing for unknown codes or text-only bodies', () => {
    expect(describeSegmentMutationError(conflict(`与已确认片段时间重叠：${B}`, { code: 'future_code', segmentIds: [A] })))
      .toMatchObject({ kind: 'overlap', segmentIds: [B] });
    expect(describeSegmentMutationError(conflict(`原片已变化：${A}`, { detail: `原片已变化：${A}` })))
      .toMatchObject({ kind: 'stale', segmentIds: [A] });
    expect(describeSegmentMutationError(conflict('片段已被修改', { code: 'segment_overlap', segmentIds: [1] })).kind)
      .toBe('revision');
  });

  it('tells overlaps inside one batch confirm apart from overlaps with confirmed segments', () => {
    const structured = describeSegmentMutationError(
      conflict(`所选片段之间时间重叠：${A},${B}`, { code: 'batch_overlap', segmentIds: [A, B] }),
      lookup,
    );
    expect(structured).toMatchObject({ kind: 'overlap', segmentIds: [A, B] });
    expect(structured.message).toMatch(/^所选片段之间时间重叠（街采 0:10.0–0:20.0）/);
    expect(structured.message).not.toContain('已确认片段');
    // Older backends only send the detail text.
    const text = describeSegmentMutationError(new APIError('CONFLICT', 409, `所选片段之间时间重叠：${A},${B}`));
    expect(text.message).toMatch(/^所选片段之间时间重叠/);
    const confirmed = describeSegmentMutationError(conflict(`与已确认片段时间重叠：${A}`, { code: 'segment_overlap', segmentIds: [A] }), lookup);
    expect(confirmed.message).toMatch(/^与已确认片段时间重叠/);
  });

  it('asks to re-annotate a create whose source changed, without claiming segments were marked stale', () => {
    for (const error of [
      conflict('原片已变化，请刷新后重新标注', { code: 'source_changed', segmentIds: [] }),
      new APIError('CONFLICT', 409, '原片已变化，请刷新后重新标注'),
    ]) {
      const result = describeSegmentMutationError(error);
      expect(result).toMatchObject({ kind: 'stale', message: '原片内容已变化，请刷新后按新原片标注。' });
    }
    expect(describeSegmentMutationError(conflict('x', { code: 'stale_segment', segmentIds: [A] })).message)
      .toContain('旧片段已标记为过期');
  });

  it('explains overlaps with no visible IDs', () => {
    const result = describeSegmentMutationError(new APIError('CONFLICT', 409, '与已确认片段时间重叠，请刷新后调整'));
    expect(result).toMatchObject({ kind: 'overlap', segmentIds: [] });
    expect(result.message).toContain('刷新');
    // The exclusion-constraint race backstop returns the structured code with no ids.
    const race = describeSegmentMutationError(
      conflict('与已确认片段时间重叠，请刷新后调整', { code: 'segment_overlap', segmentIds: [] }),
      lookup,
    );
    expect(race).toMatchObject({ kind: 'overlap', segmentIds: [] });
    expect(race.message).toContain('不在当前列表中');
  });

  it('distinguishes stale sources from revision conflicts', () => {
    expect(describeSegmentMutationError(new APIError('CONFLICT', 409, `原片已变化，片段已标记为过期：${A}`)))
      .toMatchObject({ kind: 'stale', segmentIds: [A] });
    expect(describeSegmentMutationError(new APIError('CONFLICT', 409, '片段已被修改，请刷新后重试')).kind).toBe('revision');
  });

  it('maps permission, missing, disabled and validation failures', () => {
    expect(describeSegmentMutationError(new APIError('FORBIDDEN', 403, '没有权限访问此资源')).kind).toBe('permission');
    expect(describeSegmentMutationError(new APIError('NOT_FOUND', 404, 'x')).kind).toBe('not_found');
    expect(describeSegmentMutationError(new APIError('SERVER_ERROR', 503, 'AI 创作中心尚未启用'))).toMatchObject({
      kind: 'disabled',
      message: 'AI 创作中心尚未启用',
    });
    expect(describeSegmentMutationError(new APIError('BAD_REQUEST', 400, '出点超过原片时长'))).toMatchObject({
      kind: 'invalid',
      message: '出点超过原片时长',
    });
    expect(describeSegmentMutationError(new Error('boom')).kind).toBe('unknown');
  });
});
