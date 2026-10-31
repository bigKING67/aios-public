import { Button } from '@lobehub/ui';
import { Download, FileVideo, FolderDown } from 'lucide-react';
import styles from "../ai-intern-test.module.css";

const MATERIALS_PATH = "/assets/recruiting/shot-v1";
const MATERIALS_ARCHIVE_PATH = "/assets/recruiting/shot-v3/aios-shot-materials.zip";
const VIDEOS = [
  { file: "sample-01.mp4", duration: "2:40", size: "7.0 MB" },
  { file: "sample-02.mp4", duration: "2:18", size: "5.3 MB" },
  { file: "sample-03.mp4", duration: "2:38", size: "4.8 MB" },
] as const;

export function TestMaterials() {
  return (
    <div className={styles.materials} role="group" aria-label="测试素材下载">
      <div className={styles.materialsHeader}>
        <div className={styles.materialsTitle}>
          <FolderDown size={16} aria-hidden="true" />
          <strong>测试素材</strong>
          <span className={styles.materialMeta}>3 条视频</span>
        </div>
        <Button
          href={MATERIALS_ARCHIVE_PATH}
          download="aios-shot-materials.zip"
        >
          <Download size={14} aria-hidden="true" />
          全部下载 · 17.1 MB
        </Button>
      </div>
      {VIDEOS.map(({ file, duration, size }) => (
        <div className={styles.materialRow} key={file}>
          <FileVideo className={styles.materialIcon} size={18} aria-hidden="true" />
          <div className={styles.materialName}>
            <span>{file}</span>
            <span className={styles.materialMeta}>{duration} · {size}</span>
          </div>
          <Button
            type="link"
            className={styles.downloadAction}
            href={`${MATERIALS_PATH}/${file}`}
            download={file}
            aria-label={`下载 ${file}`}
          >
            下载
          </Button>
        </div>
      ))}
      <p className={styles.materialsNote}>
        ZIP 内含视频和作业说明。素材仅用于本次招聘测试，请勿外传。
      </p>
    </div>
  );
}
