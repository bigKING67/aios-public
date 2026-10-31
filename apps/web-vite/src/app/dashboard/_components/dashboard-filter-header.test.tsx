import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlatformTabKey } from './dashboard-config';
import { DashboardFilterHeader, type DashboardFilterHeaderProps } from './dashboard-filter-header';

afterEach(cleanup);

const DAY = dayjs('2026-10-20');

function renderHeader(overrides: Partial<DashboardFilterHeaderProps> = {}) {
  const props: DashboardFilterHeaderProps = {
    activeTab: 'overview' as PlatformTabKey,
    allowedTabs: ['overview'] as PlatformTabKey[],
    visibleTabs: [{ key: 'overview' as PlatformTabKey, label: '总览' }],
    dateMode: 'day',
    dayValue: DAY,
    weekValue: DAY,
    monthValue: DAY,
    yearValue: DAY,
    customRange: [DAY.subtract(6, 'day'), DAY],
    dateBounds: { minDate: null, maxDate: null },
    isDateBoundsReady: true,
    dateBoundsStatus: 'ready',
    onActiveTabChange: vi.fn(),
    onDateModeChange: vi.fn(),
    onDayValueChange: vi.fn(),
    onWeekValueChange: vi.fn(),
    onMonthValueChange: vi.fn(),
    onYearValueChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onCustomRangeLimitExceeded: vi.fn(),
    ...overrides,
  };
  render(<DashboardFilterHeader {...props} />, { wrapper: MemoryRouter });
  return props;
}

describe('DashboardFilterHeader', () => {
  it('switches the date mode from the named group', async () => {
    const props = renderHeader();
    const group = screen.getByRole('group', { name: '时间维度' });

    await userEvent.click(within(group).getByRole('button', { name: '周' }));

    expect(props.onDateModeChange).toHaveBeenCalledWith('week');
  });

  it('shows the selected day in the picker and the bounds status', () => {
    renderHeader({ dateBoundsStatus: 'loading' });

    expect(screen.getByDisplayValue('2026/10/20')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在校准数据日期...');
    expect(screen.getByRole('link', { name: '返回首页' })).toBeInTheDocument();
  });
});
