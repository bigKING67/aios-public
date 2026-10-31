import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { SourceSpendLabel } from './source-spend-label';

afterEach(cleanup);

describe('source spend label', () => {
  it('shows an incomplete unknown window as neutral data with an explicit known subtotal', () => {
    render(
      <LobeProvider>
        <SourceSpendLabel spend={{
          spend30d: 82_900,
          class: 'unknown',
          asOf: '2026-10-29',
          complete: false,
          syncedDays: 18,
          windowDays: 30,
        }} />
      </LobeProvider>,
    );

    expect(screen.getByText('无数据')).toBeInTheDocument();
    expect(screen.getByText('消耗只同步了 18/30 天 · 已知小计 ¥8.3万')).toBeInTheDocument();
    expect(screen.queryByText(/达标/)).not.toBeInTheDocument();
  });

  it('keeps the compact coverage honest about the subtotal', () => {
    render(
      <LobeProvider>
        <SourceSpendLabel compact spend={{
          spend30d: 82_900,
          class: 'unknown',
          asOf: '2026-10-29',
          complete: false,
          syncedDays: 18,
          windowDays: 30,
        }} />
      </LobeProvider>,
    );

    expect(screen.getByText('消耗 18/30 天 · 小计 ¥8.3万')).toBeInTheDocument();
  });
});
