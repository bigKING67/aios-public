import { Button } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import workbenchStyles from './content-assets-detail-workbench.module.css';

export type ContentAssetDetailWorkbenchAction = 'profile' | 'platform-video' | 'ad-material';

export function ContentAssetDetailWorkbenchActions({
  activeAction,
  canWrite,
  platformVideoCount,
  adMaterialCount,
  platformVideoShortcutLabel,
  adMaterialShortcutLabel,
  onEditProfile,
  onPlatformVideoShortcut,
  onAdMaterialShortcut,
}: {
  activeAction?: ContentAssetDetailWorkbenchAction | null;
  canWrite: boolean;
  platformVideoCount: number;
  adMaterialCount: number;
  platformVideoShortcutLabel: string;
  adMaterialShortcutLabel: string;
  onEditProfile: () => void;
  onPlatformVideoShortcut: () => void;
  onAdMaterialShortcut: () => void;
}) {
  return (
    <div className={workbenchStyles.actionCluster}>
      <Button
        type="text"
        className={workbenchStyles.actionButton}
        data-active={activeAction === 'profile' ? 'true' : undefined}
        icon={<EditOutlined />}
        disabled={!canWrite}
        onClick={onEditProfile}
      >
        编辑档案
      </Button>
      <Button
        type="text"
        className={workbenchStyles.actionButton}
        data-active={activeAction === 'platform-video' ? 'true' : undefined}
        icon={platformVideoCount > 0 ? undefined : <PlusOutlined />}
        disabled={!canWrite && platformVideoCount === 0}
        onClick={onPlatformVideoShortcut}
      >
        {platformVideoShortcutLabel}
      </Button>
      <Button
        type="text"
        className={workbenchStyles.actionButton}
        data-active={activeAction === 'ad-material' ? 'true' : undefined}
        icon={adMaterialCount > 0 ? undefined : <PlusOutlined />}
        disabled={!canWrite && adMaterialCount === 0}
        onClick={onAdMaterialShortcut}
      >
        {adMaterialShortcutLabel}
      </Button>
    </div>
  );
}
