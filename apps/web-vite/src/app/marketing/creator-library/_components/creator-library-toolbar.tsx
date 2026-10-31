import { Button } from '@lobehub/ui';
import { Download, Import, Plus, UploadIcon } from 'lucide-react';
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

      <div className={styles.toolbarActions}>
        <Button icon={<Download size={14} strokeWidth={1.8} aria-hidden="true" />} onClick={onDownloadTemplate}>
          下载 XLSX 模板
        </Button>
        {canCreateOrImport ? (
          <Button icon={<Import size={14} strokeWidth={1.8} aria-hidden="true" />} onClick={onImport}>
            批量导入
          </Button>
        ) : null}
        <Button icon={<UploadIcon size={14} strokeWidth={1.8} aria-hidden="true" />} loading={exporting} onClick={onExport}>
          导出当前筛选
        </Button>
        {canCreateOrImport ? (
          <Button type="primary" icon={<Plus size={14} strokeWidth={1.8} aria-hidden="true" />} onClick={onCreate}>
            新增达人
          </Button>
        ) : null}
      </div>
    </section>
  );
}
