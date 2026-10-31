import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { RemixQcSummary } from './remix-qc-summary';

afterEach(cleanup);

it('expands a bounded readable QC report with thresholds, positions, caveats and partial coverage', () => {
  const freezeEvents = Array.from({ length: 21 }, (_, index) => ({
    startMs: index * 1_000,
    endMs: index * 1_000 + 800,
    sourceExempt: index === 0,
  }));
  const qc = {
    status: 'failed',
    reasons: ['frame_freeze', 'timestamp_gap', 'technical_inspection'],
    freezeCount: 21,
    timestampGapCount: 3,
    duplicatePairCount: 2,
    maxAvOffsetMs: 140,
    sourceStatus: 'passed',
    report: {
      timingStatus: 'failed', freezeStatus: 'failed', pictureStatus: 'passed',
      frameCount: 4_500, audioStartOffsetMs: 24, audioEndOffsetMs: -140,
      freezeThresholdMs: 800, avOffsetThresholdMs: 100, ptsGapThresholdMs: 80,
      freezeNoiseDb: -45, pictureMaxDistance: 0.12, pictureMinTexture: 0.08,
      checkedSegments: 6, errorStage: 'technical_inspection',
      freezeEvents, freezeEventCount: 22,
      timestampGaps: [{ frame: 320, deltaMs: 145 }],
    },
  } satisfies NonNullable<StudioRemixBatchItem['qc']>;

  render(<RemixQcSummary qc={qc} />);
  fireEvent.click(screen.getByText('查看质检报告'));

  expect(screen.getByRole('heading', { name: '检查状态' })).toBeInTheDocument();
  expect(screen.getByText('4,500')).toBeInTheDocument();
  expect(screen.getByText('+24 ms')).toBeInTheDocument();
  expect(screen.getByText('-140 ms')).toBeInTheDocument();
  expect(screen.getByText('技术检查')).toBeInTheDocument();
  const freezes = screen.getByRole('list', { name: '冻帧位置' });
  expect(within(freezes).getAllByRole('listitem')).toHaveLength(20);
  expect(within(freezes).getByText('原片静止，已豁免')).toBeInTheDocument();
  expect(screen.getByText('共 22 处，当前仅展示 20 处，报告为部分展示。')).toBeInTheDocument();
  const gaps = screen.getByRole('list', { name: '时间戳问题位置' });
  expect(within(gaps).getByText('第 320 帧')).toBeInTheDocument();
  expect(screen.getByText('共 3 处，当前仅展示 1 处，报告为部分展示。')).toBeInTheDocument();
  expect(screen.getByText(/音视频起止偏差只衡量轨道起止，不代表口型或语句同步/)).toBeInTheDocument();
  expect(screen.getByText(/图片检查基于抽样帧，仍需人工完整观看成片/)).toBeInTheDocument();
});
