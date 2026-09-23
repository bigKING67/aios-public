import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useSampleInventoryUrlState } from './use-sample-inventory-url-state';

function createWrapper(initialEntry: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe('useSampleInventoryUrlState', () => {
  it('normalizes invalid search params to the operational default', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper('/sample-inventory?tab=unknown&status=done&page=-2'),
    });

    expect(result.current.state).toEqual({
      tab: 'outbound',
      keyword: '',
      status: 'pending',
      stockStatus: 'all',
      productKind: 'all',
      sortOrder: 'default',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('keeps tab and filters shareable while resetting dependent state', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper('/sample-inventory?tab=outbound-records&status=sampled&page=3'),
    });

    act(() => result.current.setTab('inventory'));
    expect(result.current.state).toEqual({
      tab: 'inventory',
      keyword: '',
      status: undefined,
      stockStatus: 'all',
      productKind: 'all',
      sortOrder: 'default',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20,
    });

    act(() => result.current.updateState({ keyword: '  S-1  ', page: 2 }));
    expect(result.current.state.keyword).toBe('S-1');
    expect(result.current.state.page).toBe(2);
  });

  it('isolates and restores filters for each primary tab', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper(
        '/sample-inventory?tab=inventory&keyword=SHAMPOO&stockStatus=low&productKind=primary&sortOrder=asc&page=2&pageSize=50',
      ),
    });

    act(() => result.current.setTab('outbound-records'));
    expect(result.current.state).toEqual({
      tab: 'outbound-records',
      keyword: '',
      status: undefined,
      stockStatus: 'all',
      productKind: 'all',
      sortOrder: 'default',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20,
    });

    act(() =>
      result.current.updateState({
        keyword: '市场部',
        status: 'approved',
        dateFrom: '2026-08-01',
        page: 3,
        pageSize: 100,
      }),
    );
    act(() => result.current.setTab('inbound-records'));
    expect(result.current.state).toMatchObject({
      tab: 'inbound-records',
      keyword: '',
      status: undefined,
      dateFrom: '',
      page: 1,
      pageSize: 20,
    });

    act(() =>
      result.current.updateState({
        keyword: '仓库操作员',
        dateFrom: '2026-08-02',
      }),
    );
    act(() => result.current.setTab('inventory'));
    expect(result.current.state).toMatchObject({
      tab: 'inventory',
      keyword: 'SHAMPOO',
      stockStatus: 'low',
      productKind: 'primary',
      sortOrder: 'asc',
      dateFrom: '',
      page: 2,
      pageSize: 50,
    });

    act(() => result.current.setTab('outbound-records'));
    expect(result.current.state).toMatchObject({
      tab: 'outbound-records',
      keyword: '市场部',
      status: 'approved',
      dateFrom: '2026-08-01',
      page: 3,
      pageSize: 100,
    });

    act(() => result.current.setTab('inbound-records'));
    expect(result.current.state).toMatchObject({
      tab: 'inbound-records',
      keyword: '仓库操作员',
      dateFrom: '2026-08-02',
      page: 1,
      pageSize: 20,
    });
  });

  it('preserves the explicit all-status filter for the outbound registration page', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper('/sample-inventory?status=all'),
    });

    expect(result.current.state).toEqual({
      tab: 'outbound',
      keyword: '',
      status: 'all',
      stockStatus: 'all',
      productKind: 'all',
      sortOrder: 'default',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('keeps stock sorting and record dates in the shareable URL state', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper(
        '/sample-inventory?tab=inventory&stockStatus=low&sortOrder=asc&dateFrom=2026-07-01&dateTo=2026-07-27',
      ),
    });

    expect(result.current.state).toMatchObject({
      stockStatus: 'low',
      sortOrder: 'asc',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-27',
    });

    act(() => result.current.updateState({ stockStatus: 'out', sortOrder: 'desc', page: 1 }));
    expect(result.current.state).toMatchObject({ stockStatus: 'out', sortOrder: 'desc' });
  });

  it('keeps product kind and the closed page-size options in URL state', () => {
    const { result } = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper('/sample-inventory?tab=inventory&productKind=gift&pageSize=50&page=2'),
    });

    expect(result.current.state).toMatchObject({
      productKind: 'gift',
      page: 2,
      pageSize: 50,
    });

    act(() => result.current.updateState({ productKind: 'primary', page: 1, pageSize: 100 }));
    expect(result.current.state).toMatchObject({
      productKind: 'primary',
      page: 1,
      pageSize: 100,
    });

    const invalid = renderHook(() => useSampleInventoryUrlState(), {
      wrapper: createWrapper('/sample-inventory?productKind=bundle&pageSize=25'),
    });
    expect(invalid.result.current.state).toMatchObject({ productKind: 'all', pageSize: 20 });
  });
});
