// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { packRows, readCompetitorCard, readEvidenceMedia } from '../_lib/competitor-card';
import { SampleSheet, StructureView } from './competitor-structure';

afterEach(cleanup);

const FRAMEWORK = readCompetitorCard({
  framework: {
    status: 'ok',
    labels: {
      framework: { mixed_voiceover: '混剪口播', live_demo: '实拍内容' },
      sellingPoint: { no_caking: '妆效', long_wear: '持妆' },
    },
    segments: [
      { startMs: 0, endMs: 8000, labelKey: 'live_demo' },
      { startMs: 8000, endMs: 20000, labelKey: 'mixed_voiceover' },
    ],
    sellingPoints: [{ startMs: 12000, endMs: 15000, labelKeys: ['long_wear'], segmentIndex: 1, quote: '一整天不晕' }],
    transcript: [
      [0, 2000, '开场先看效果'],
      [9000, 12000, '这个睫毛膏不结块'],
      [12000, 15000, '一整天不晕'],
    ],
  },
})!.framework;

const SAMPLES = readEvidenceMedia(
  [1000, 5000, 9000, 13000, 17000].map((ms) => ({ kind: 'sample', startMs: ms, endMs: ms, url: `https://f/${ms}.webp` })),
).samples;

const transcriptItems = () => within(screen.getByRole('list', { name: '口播转写' })).getAllByRole('listitem');
const scriptLines = () => transcriptItems().map((item) => item.textContent);
const litLines = () => transcriptItems().filter((item) => item.dataset.lit === 'true').map((item) => item.textContent);

describe('SampleSheet', () => {
  it('shows every sample frame in time order, all at once', () => {
    render(<SampleSheet samples={SAMPLES} />);
    const frames = within(screen.getByRole('list', { name: '采样图' })).getAllByRole('button');
    expect(frames.map((frame) => frame.getAttribute('alt'))).toEqual(['0:01 画面', '0:05 画面', '0:09 画面', '0:13 画面', '0:17 画面']);
    expect(screen.getByRole('heading', { name: /^采样图\s*5 张$/ })).toBeTruthy();
  });

  it('opens a frame from the keyboard as from a click', () => {
    render(<SampleSheet samples={SAMPLES} />);
    const frame = within(screen.getByRole('list', { name: '采样图' })).getAllByRole('button')[2];
    let clicks = 0;
    frame.addEventListener('click', () => (clicks += 1));
    expect(frame.tabIndex).toBe(0);
    fireEvent.keyDown(frame, { key: 'Enter' });
    fireEvent.keyDown(frame, { key: ' ' });
    fireEvent.keyDown(frame, { key: 'a' });
    expect(clicks).toBe(2);
  });

  it('renders nothing for analyses without samples', () => {
    const { container } = render(<SampleSheet samples={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('StructureView', () => {
  it('lays the structure on a timeline over the ruler, with the 卖点 counts as its legend', () => {
    render(<StructureView awemeId="7696817715536874793" framework={FRAMEWORK} durationMs={20000} action={null} />);
    expect(screen.getByTitle('抖音原片播放器')).toBeTruthy();
    const timeline = screen.getByRole('group', { name: '框架结构' });
    // Blocks carry their time in the name and tooltip, never as visible text beside the label.
    const live = within(timeline).getByRole('button', { name: '实拍内容 0:00–0:08' });
    expect(live.textContent).toBe('实拍内容');
    expect(live.style.left).toBe('0.000%');
    expect(live.style.width).toBe('40.000%');
    // The ruler reads under the lanes, the legend under the ruler.
    const lanes = [...timeline.children];
    expect(lanes.at(-2)?.textContent).toContain('0:20');
    expect(within(timeline).getByRole('list', { name: '卖点统计' }).textContent).toBe('持妆×1');
  });

  it('shows the whole transcript first and lights a picked block lines without hiding the rest', () => {
    render(<StructureView awemeId={null} framework={FRAMEWORK} durationMs={20000} action={null} />);
    const timeline = screen.getByRole('group', { name: '框架结构' });
    expect(within(timeline).getByRole('button', { name: '实拍内容 0:00–0:08' }).getAttribute('aria-pressed')).toBe('false');
    expect(scriptLines()).toEqual(['0:00开场先看效果', '0:09这个睫毛膏不结块', '0:12一整天不晕']);
    expect(screen.getByText('3 句')).toBeTruthy();
    expect(litLines()).toEqual([]);

    const mixed = within(timeline).getByRole('button', { name: '混剪口播 0:08–0:20' });
    fireEvent.click(mixed);
    expect(mixed.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('0:08–0:20')).toBeTruthy();
    expect(scriptLines()).toHaveLength(3);
    expect(litLines()).toEqual(['0:09这个睫毛膏不结块', '0:12一整天不晕']);

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(litLines()).toEqual([]);
    expect(screen.queryByRole('button', { name: '全部' })).toBeNull();
  });

  it('picks a selling point on its own lane with its quote, and a second click clears it', () => {
    render(<StructureView awemeId={null} framework={FRAMEWORK} durationMs={null} action={null} />);
    const point = screen.getByRole('button', { name: '持妆 0:12–0:15' });
    fireEvent.click(point);
    expect(screen.getByText('“一整天不晕”')).toBeTruthy();
    expect(litLines()).toEqual(['0:12一整天不晕']);
    fireEvent.click(point);
    expect(screen.queryByText('“一整天不晕”')).toBeNull();
    expect(litLines()).toEqual([]);
  });

  it('marks each line with the tone of the framework segment it opens in', () => {
    render(<StructureView awemeId={null} framework={FRAMEWORK} durationMs={20000} action={null} />);
    const tones = transcriptItems().map((item) => item.firstElementChild?.getAttribute('title'));
    expect(tones).toEqual(['实拍内容', '混剪口播', '混剪口播']);
  });

  it('keeps the framework and transcript when only the selling points failed, and offers a re-run', () => {
    const partial = readCompetitorCard({
      framework: {
        status: 'ok',
        sellingPointError: 'SuggestionError: x',
        labels: { framework: { live_demo: '实拍内容' }, sellingPoint: {} },
        segments: [{ startMs: 0, endMs: 8000, labelKey: 'live_demo' }],
        transcript: [[0, 2000, '开场先看效果']],
      },
    })!.framework;
    render(<StructureView awemeId={null} framework={partial} durationMs={8000} action={<button type="button">重新生成框架和口播</button>} />);
    expect(scriptLines()).toEqual(['0:00开场先看效果']);
    const timeline = screen.getByRole('group', { name: '框架结构' });
    expect(within(timeline).getByText('卖点识别失败')).toBeTruthy();
    expect(within(timeline).queryByRole('list', { name: '卖点统计' })).toBeNull();
    expect(screen.getByText('卖点识别失败：框架段和口播转写已保留。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新生成框架和口播' })).toBeTruthy();
  });

  it('offers no re-run on a complete structure', () => {
    render(<StructureView awemeId={null} framework={FRAMEWORK} durationMs={20000} action={<button type="button">重新生成框架和口播</button>} />);
    expect(screen.queryByRole('button', { name: '重新生成框架和口播' })).toBeNull();
  });

  it('explains a missing or failed structure and offers the re-run action', () => {
    const { rerender } = render(
      <StructureView awemeId={null} framework={null} durationMs={null} action={<button type="button">补充框架和口播</button>} />,
    );
    expect(screen.queryByRole('group', { name: '框架结构' })).toBeNull();
    expect(screen.getByText(/早于框架结构上线/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '补充框架和口播' })).toBeTruthy();
    const unavailable = readCompetitorCard({ framework: { status: 'unavailable', reason: '当前节点没有本地框架切段（local-v2）' } })!.framework;
    rerender(<StructureView awemeId={null} framework={unavailable} durationMs={null} action={null} />);
    expect(screen.getByText(/没有生成框架、卖点和口播转写：当前节点没有本地框架切段/)).toBeTruthy();
  });
});

describe('packRows', () => {
  it('moves overlapping spans to the next row and keeps the rest on the first', () => {
    const span = (startMs: number, endMs: number, index: number) => ({ index, startMs, endMs });
    const rows = packRows([span(0, 5000, 0), span(3000, 8000, 1), span(5000, 9000, 2), span(8000, 10000, 3)]);
    expect(rows.map((row) => row.map((item) => item.index))).toEqual([[0, 2], [1, 3]]);
  });
});
