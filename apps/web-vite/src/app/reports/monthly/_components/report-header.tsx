'use client';

import { Button, Space, message } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { usePermission } from '@/hooks/use-permission';
import { REPORT_EXPORT_PERMISSIONS } from '@/lib/report-permissions';

interface ReportHeaderReport {
  meta?: {
    period_start?: string;
    period_end?: string;
    generated_at?: string;
  };
}

interface ReportHeaderProps {
  report: ReportHeaderReport;
  reportId: string;
}

/**
 * 月报头部组件：标题、周期、报告 ID、生成时间与基础操作。
 */
export function ReportHeader({ report, reportId }: ReportHeaderProps) {
  const canExportReport = usePermission(REPORT_EXPORT_PERMISSIONS, 'any');

  const handleExportPDF = () => {
    message.info('PDF 导出功能开发中...');
  };

  const handlePrint = () => {
    window.print();
  };

  const periodStart = report.meta?.period_start
    ? new Date(report.meta.period_start)
    : null;
  const periodEnd = report.meta?.period_end ? new Date(report.meta.period_end) : null;
  const generatedAt = report.meta?.generated_at ? new Date(report.meta.generated_at) : null;

  const periodLabel = periodStart && periodEnd
    ? `${periodStart.toLocaleDateString('zh-CN')} ~ ${periodEnd.toLocaleDateString('zh-CN')}`
    : '--';
  const generatedLabel = generatedAt
    ? generatedAt.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  return (
    <div className="bg-bg-card rounded-lg shadow-sm p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">月报</h1>
          <div className="space-y-2">
            <p className="text-text-secondary">
              <span className="font-semibold">周期：</span>
              {periodLabel}
            </p>
            <p className="text-text-secondary">
              <span className="font-semibold">报告 ID：</span>
              {reportId}
            </p>
            <p className="text-text-tertiary text-sm">
              <span className="font-semibold">生成时间：</span>
              {generatedLabel}
            </p>
          </div>
        </div>

        <Space wrap>
          {canExportReport ? (
            <Button
              type="default"
              icon={<DownloadOutlined />}
              onClick={handleExportPDF}
            >
              导出 PDF
            </Button>
          ) : null}
          <Button
            type="default"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            打印
          </Button>
        </Space>
      </div>
    </div>
  );
}
