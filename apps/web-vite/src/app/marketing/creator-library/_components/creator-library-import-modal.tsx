import { useMemo, useState } from 'react';
import { Alert, Button, Modal, Space, Table } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { FileDropzone } from '@/components/molecules/file-dropzone';
import styles from './creator-library-import-modal.module.css';
import {
  csvRowToPayload,
  parseCreatorLibraryUpload,
} from '../_lib/creator-library-csv';
import type { CreatorLibraryCsvRow, CreatorLibraryPayload } from '../_lib/creator-library-types';

interface CreatorLibraryImportModalProps {
  open: boolean;
  importing?: boolean;
  onImport: (rows: CreatorLibraryPayload[]) => void;
  onCancel: () => void;
}

export function CreatorLibraryImportModal({
  open,
  importing,
  onImport,
  onCancel,
}: CreatorLibraryImportModalProps) {
  const [rows, setRows] = useState<CreatorLibraryCsvRow[]>([]);
  const validRows = useMemo(() => rows.filter((row) => !row.error), [rows]);
  const errorRows = rows.length - validRows.length;
  const canImport = validRows.length > 0 && errorRows === 0;

  const handleFile = async (file: File) => {
    try {
      setRows(await parseCreatorLibraryUpload(file));
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件解析失败';
      setRows([{ platform: '', influencerName: '', rowNumber: 1, error: message }]);
    }
  };

  const columns: ColumnsType<CreatorLibraryCsvRow> = [
    { title: '行号', dataIndex: 'rowNumber', width: 72 },
    { title: '平台', dataIndex: 'platform', width: 100 },
    { title: '达人昵称', dataIndex: 'influencerName', width: 150 },
    { title: '达人ID', dataIndex: 'influencerId', width: 140 },
    { title: '归属BD', dataIndex: 'ownerName', width: 120 },
    {
      title: '校验',
      key: 'validation',
      width: 180,
      render: (_, record) => record.error || '可导入',
    },
  ];

  return (
    <Modal
      title="批量导入达人"
      open={open}
      width={760}
      onCancel={onCancel}
      destroyOnHidden
      footer={
        <Space wrap>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            loading={importing}
            disabled={!canImport}
            onClick={() => onImport(rows.map(csvRowToPayload))}
          >
            {errorRows > 0 ? `请先修正 ${errorRows} 行异常` : `确认导入 ${validRows.length} 行`}
          </Button>
        </Space>
      }
    >
      <div className={styles.importStack}>
        <Alert
          type="info"
          showIcon
          title="支持 XLSX 模板和 CSV 兼容导入。每条记录必须填写达人ID和达人昵称；导入按平台 + 达人ID 去重。"
          description="归属BD若不存在，导入时会自动创建BD账号并授予BD角色；是否可合作不再单独填写，可在合作状态中填写“❌不合作”。"
        />
        <FileDropzone
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={importing}
          icon={<InboxOutlined />}
          title="点击或拖拽 XLSX / CSV 文件到这里"
          hint="请先下载 XLSX 模板，填写“达人表”后保持表头不变再导入。"
          onFile={handleFile}
        />
        {rows.length > 0 ? (
          <div className={styles.importPreview}>
            <div className={styles.importPreviewMeta}>
              <strong>预览 {rows.length} 行</strong>
              <span>
                {errorRows > 0
                  ? `发现 ${errorRows} 行异常，需修正后才能导入`
                  : `可导入 ${validRows.length} 行`}
              </span>
            </div>
            <Table<CreatorLibraryCsvRow>
              rowKey="rowNumber"
              size="small"
              columns={columns}
              dataSource={rows.slice(0, 50)}
              pagination={false}
              scroll={{ x: 760, y: 280 }}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
