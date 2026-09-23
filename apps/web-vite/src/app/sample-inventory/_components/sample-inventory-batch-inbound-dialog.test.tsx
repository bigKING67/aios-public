import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SampleInventorySample } from '@/lib/generated-api-contract';
import { SampleInventoryBatchInboundDialog } from './sample-inventory-batch-inbound-dialog';

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const sample: SampleInventorySample = {
  id: 7,
  sampleCode: 'S-007',
  sampleName: '测试样品',
  model: null,
  category: null,
  productKind: 'gift',
  location: null,
  remark: null,
  onHandQuantity: 8,
  reservedQuantity: 0,
  availableQuantity: 8,
  isLowStock: false,
  version: 1,
  createdAt: '2026-07-27T00:00:00Z',
  updatedAt: '2026-07-27T00:00:00Z',
  archivedAt: null,
};

const earlierSample: SampleInventorySample = {
  ...sample,
  id: 3,
  sampleCode: 'S-003',
  sampleName: '更早样品',
};

describe('SampleInventoryBatchInboundDialog', () => {
  it('submits one atomic inbound row per selected sample with independent quantities', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SampleInventoryBatchInboundDialog
        open
        samples={[sample, earlierSample]}
        loading={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const earlierQuantity = screen.getByRole('spinbutton', { name: '更早样品入库数量' });
    const laterQuantity = screen.getByRole('spinbutton', { name: '测试样品入库数量' });
    expect(earlierQuantity).toBeDisabled();
    expect(laterQuantity).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /更早样品/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /测试样品/ }));
    fireEvent.change(earlierQuantity, { target: { value: '5' } });
    fireEvent.change(laterQuantity, { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('姓名'), {
      target: { value: '测试操作人' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认批量入库' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith([
      {
        sampleId: earlierSample.id,
        quantity: 5,
        operatorName: '测试操作人',
        trackingNumber: null,
        remark: null,
        occurredAt: undefined,
      },
      {
        sampleId: sample.id,
        quantity: 3,
        operatorName: '测试操作人',
        trackingNumber: null,
        remark: null,
        occurredAt: undefined,
      },
    ]);
  });
});
