import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { WeeklyDataTable, WeeklyEmptyState } from './tabs/weekly-primitives';
import { WeeklyReportTabPanels } from './weekly-report-tab-panels';

afterEach(() => cleanup());

const TAB_ITEMS = [
  { key: 'overview', label: '概览', children: <p>概览内容</p> },
  { key: 'douyin', label: '抖音', children: <p>抖音内容</p> },
  { key: 'tmall', label: '天猫', children: <p>天猫内容</p> },
];

interface GoodsRow {
  id: string;
  name: string;
  gmv: number;
}

describe('weekly report on lobe-ui', () => {
  it('mounts a panel on first visit and keeps visited panels mounted but hidden', () => {
    const { rerender } = render(<WeeklyReportTabPanels activeKey="overview" items={TAB_ITEMS} />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('概览内容');
    expect(screen.queryByText('抖音内容')).not.toBeInTheDocument();

    rerender(<WeeklyReportTabPanels activeKey="douyin" items={TAB_ITEMS} />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('抖音内容');
    const overviewPanel = screen.getByText('概览内容').closest('[role="tabpanel"]');
    expect(overviewPanel).toHaveAttribute('hidden');
    expect(overviewPanel).toHaveAttribute('aria-labelledby', 'weekly-report-tab-overview');
    expect(screen.queryByText('天猫内容')).not.toBeInTheDocument();
  });

  it('renders weekly rows through lobe Table with the pinned column marked as fixed', () => {
    render(
      <LobeProvider>
        <WeeklyDataTable<GoodsRow>
          rowKey="id"
          dataSource={[
            { id: 'g1', name: '精华水', gmv: 1200 },
            { id: 'g2', name: '面霜', gmv: 800 },
          ]}
          columns={[
            { title: '商品', dataIndex: 'name', key: 'name', fixed: 'left', width: 160 },
            { title: 'GMV', dataIndex: 'gmv', key: 'gmv', width: 120 },
          ]}
          pagination={false}
          scroll={{ x: 600 }}
        />
      </LobeProvider>,
    );

    expect(screen.getByRole('columnheader', { name: '商品' })).toHaveClass('lobe-table-cell-fix-start');
    const pinnedCell = screen.getByRole('cell', { name: '精华水' });
    expect(pinnedCell).toHaveClass('lobe-table-cell-fix-start');
    expect(screen.getByRole('cell', { name: '800' })).not.toHaveClass('lobe-table-cell-fix-start');
  });

  it('shows the weekly empty description', () => {
    render(
      <LobeProvider>
        <WeeklyEmptyState description="暂无趋势数据" />
      </LobeProvider>,
    );
    expect(screen.getByText('暂无趋势数据')).toBeInTheDocument();
  });
});
