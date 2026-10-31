import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatorDetailExportActions } from './creator-detail-export-actions';

afterEach(cleanup);

const baseProps = {
  exportLoading: false,
  exportDisabled: false,
  isAuthenticated: true,
  onNavigateToLogin: vi.fn(),
};

describe('CreatorDetailExportActions', () => {
  it('exports directly when there is no export menu', async () => {
    const onExport = vi.fn();
    render(<CreatorDetailExportActions {...baseProps} onExport={onExport} />);

    await userEvent.click(screen.getByRole('button', { name: '导出明细' }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('未登录不可下载明细')).not.toBeInTheDocument();
  });

  it('runs the chosen menu item and skips a disabled one', async () => {
    const onExport = vi.fn();
    const onSummary = vi.fn();
    const onTransactions = vi.fn();
    render(
      <CreatorDetailExportActions
        {...baseProps}
        onExport={onExport}
        exportMenuItems={[
          { key: 'summary', label: '导出当前汇总', onClick: onSummary },
          { key: 'transactions', label: '导出交易明细', disabled: true, onClick: onTransactions },
        ]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '导出明细' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '导出交易明细' }));
    expect(onTransactions).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('menuitem', { name: '导出当前汇总' }));
    expect(onSummary).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('offers the login entry when signed out', async () => {
    const onNavigateToLogin = vi.fn();
    render(
      <CreatorDetailExportActions
        {...baseProps}
        exportDisabled
        isAuthenticated={false}
        onExport={vi.fn()}
        onNavigateToLogin={onNavigateToLogin}
      />
    );

    expect(screen.getByText('未登录不可下载明细')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出明细' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '去登录后导出' }));
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
