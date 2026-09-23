import { Button, Space } from 'antd';
import {
  DownloadOutlined,
  ImportOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import styles from './creator-library-toolbar.module.css';

interface CreatorLibraryToolbarProps {
  selectedCount: number;
  canCreateOrImport: boolean;
  exporting?: boolean;
  onCreate: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  onExport: () => void;
}

export function CreatorLibraryToolbar({
  selectedCount,
  canCreateOrImport,
  exporting,
  onCreate,
  onImport,
  onDownloadTemplate,
  onExport,
}: CreatorLibraryToolbarProps) {
  return (
    <section className={styles.toolbar}>
      <div className={styles.toolbarMeta}>
        <p className={styles.toolbarTitle}>达人档案</p>
        <span className={styles.toolbarHint}>
          {selectedCount > 0
            ? `已选择 ${selectedCount} 个达人`
            : canCreateOrImport
              ? '支持新增、编辑、跟进、BD 分配、批量导入与筛选导出'
              : '当前账号可查看、下载模板与导出当前筛选'}
        </span>
      </div>

      <Space wrap className={styles.toolbarActions}>
        <Button icon={<DownloadOutlined />} onClick={onDownloadTemplate}>
          下载 XLSX 模板
        </Button>
        {canCreateOrImport ? (
          <Button icon={<ImportOutlined />} onClick={onImport}>
            批量导入
          </Button>
        ) : null}
        <Button icon={<UploadOutlined />} loading={exporting} onClick={onExport}>
          导出当前筛选
        </Button>
        {canCreateOrImport ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新增达人
          </Button>
        ) : null}
      </Space>
    </section>
  );
}
