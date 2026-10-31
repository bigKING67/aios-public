import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { RemixDeliveryStatus } from './remix-delivery';

type Delivery = NonNullable<StudioRemixBatchItem['delivery']>;

afterEach(cleanup);

const base: Delivery = {
  status: 'pending', cloudVideoId: null, videoName: null, errorCode: null,
  attempts: 0, updatedAt: null, enabled: true, canRetry: false,
};

it('renders nothing when the output has no delivery state', () => {
  render(<RemixDeliveryStatus />);
  expect(screen.queryByLabelText(/云管家推送/)).not.toBeInTheDocument();
});

it.each([
  ['pending', '待推送'],
  ['submitting', '推送中'],
  ['importing', '推送中'],
  ['succeeded', '已推送'],
  ['failed', '推送失败'],
  ['uncertain', '结果待核实'],
] as const)('maps delivery status %s to %s', (status, label) => {
  render(<RemixDeliveryStatus delivery={{ ...base, status }} compact />);
  expect(screen.getByLabelText(`云管家推送：${label}`)).toBeInTheDocument();
});

it('shows the vendor receipt after success even when delivery is now disabled', () => {
  render(<RemixDeliveryStatus delivery={{
    ...base, status: 'succeeded', enabled: false, cloudVideoId: 'cloud-42', videoName: '粉底液成片 01', attempts: 2,
  }} />);
  expect(screen.getByText('已推送')).toBeInTheDocument();
  expect(screen.getByText('cloud-42')).toBeInTheDocument();
  expect(screen.getByText('粉底液成片 01')).toBeInTheDocument();
  expect(screen.queryByText('推送未启用')).not.toBeInTheDocument();
});

it('does not retry disabled, uncertain or unknown outcomes and never exposes an unknown error code', () => {
  const retry = vi.fn();
  const { rerender } = render(<RemixDeliveryStatus delivery={{ ...base, status: 'failed', enabled: false, canRetry: true }} onRetry={retry} />);
  expect(screen.getByText('推送未启用')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();

  rerender(<RemixDeliveryStatus delivery={{ ...base, status: 'uncertain', canRetry: true, errorCode: 'submission_unknown' }} onRetry={retry} />);
  expect(screen.getByText(/结果不明确时禁止重复推送/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();

  rerender(<RemixDeliveryStatus delivery={{ ...base, status: 'future_status', canRetry: true, errorCode: 'private_vendor_code' }} onRetry={retry} />);
  expect(screen.getByText('推送未完成，请核实配置与云管家状态。')).toBeInTheDocument();
  expect(screen.queryByText('private_vendor_code')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
});

it('offers one explicit queue action only for a retryable failed delivery', () => {
  const retry = vi.fn();
  render(<RemixDeliveryStatus delivery={{ ...base, status: 'failed', errorCode: 'import_failed', canRetry: true }} onRetry={retry} />);
  expect(screen.getByText('云管家导入失败。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新排队' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
