import { Button } from 'antd';
import { InboxOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { FileDropzone } from '@/components/molecules/file-dropzone';
import { formatBytes } from '../_lib/content-assets-formatters';
import type { ContentAssetUploadProgress } from '../_lib/content-assets-types';
import { getFileExt } from './content-assets-import-modal-values';
import uploadStyles from './content-assets-upload-modal.module.css';

interface ContentAssetsImportUploadPanelProps {
  confirmLoading: boolean;
  file: File | null;
  fileError: string;
  isSourceUpload: boolean;
  progress: ContentAssetUploadProgress | null;
  sourceAssetTitle: string;
  onSelectFile: (file: File) => void;
  onRemoveFile: () => void;
}

export function ContentAssetsImportUploadPanel({
  confirmLoading,
  file,
  fileError,
  isSourceUpload,
  progress,
  sourceAssetTitle,
  onSelectFile,
  onRemoveFile,
}: ContentAssetsImportUploadPanelProps) {
  return (
    <div className={uploadStyles.uploadStack}>
      <FileDropzone
        accept="video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv"
        disabled={confirmLoading}
        icon={<InboxOutlined />}
        title="点击或拖拽视频源文件到这里"
        hint="支持 MP4 / MOV / M4V / WEBM / AVI / MKV；预览和封面会在后台生成。"
        onFile={onSelectFile}
      />
      {file ? (
        <div className={uploadStyles.uploadFilePreview}>
          <div>
            <strong>{file.name}</strong>
            <span>
              {formatBytes(file.size)} · {file.type || getFileExt(file.name).toUpperCase()}
            </span>
          </div>
          <Button size="small" disabled={confirmLoading} onClick={onRemoveFile}>
            移除
          </Button>
        </div>
      ) : null}
      {fileError ? <p className={uploadStyles.uploadError}>{fileError}</p> : null}
      {isSourceUpload ? (
        <div className={uploadStyles.sourceUploadContext}>
          <strong>待补源资产</strong>
          <span>{sourceAssetTitle}</span>
        </div>
      ) : null}
      {confirmLoading ? (
        <div className={uploadStyles.uploadProgressPanel} aria-live="polite">
          <div className={uploadStyles.uploadProgressHeader}>
            <strong>{uploadStageLabel(progress?.stage)}</strong>
            <span>{uploadProgressText(progress)}</span>
          </div>
          <progress className={uploadStyles.uploadProgressBar} value={progress?.percent ?? 0} max={100} />
          <div className={uploadStyles.uploadProgressHint}>
            <span data-active={progress?.stage === 'creating'}>校验重复</span>
            <span data-active={progress?.stage === 'importing'}>下载入库</span>
            <span data-active={progress?.stage === 'uploading'}>上传源视频</span>
            <span data-active={progress?.stage === 'completing'}>加入处理队列</span>
          </div>
        </div>
      ) : null}
      <div className={uploadStyles.uploadPipelineNote}>
        <InfoCircleOutlined />
        <span>
          {isSourceUpload
            ? '这是补传源文件：浏览器会使用短时签名链接把原始视频直传火山 TOS，完成后该素材会从待补源转入处理队列。'
            : '本地文件使用短时签名链接直传火山 TOS；可先解析抖音/千川链接，抖音无法直连下载时会保留视频 ID，选择本地文件后自动绑定。'}
        </span>
      </div>
    </div>
  );
}

function uploadStageLabel(stage?: ContentAssetUploadProgress['stage']): string {
  const labels: Record<ContentAssetUploadProgress['stage'], string> = {
    creating: '正在校验重复并创建素材记录',
    importing: '正在从链接导入源视频',
    uploading: '正在上传源视频',
    completing: '正在加入处理队列',
  };
  return stage ? labels[stage] : '正在准备上传';
}

function uploadProgressText(progress: ContentAssetUploadProgress | null): string {
  if (!progress) return '0%';
  const percent = progress.percent == null ? '--' : `${progress.percent}%`;
  if (!progress.totalBytes) return percent;
  return `${percent} · ${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`;
}
