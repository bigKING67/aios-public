import { Button } from "antd";
import styles from "../ai-intern-test.module.css";

const MATERIALS_PATH = "/assets/recruiting/shot-v1";
const VIDEOS = [
  { file: "sample-01.mp4", duration: "2:40", size: "7.0 MB" },
  { file: "sample-02.mp4", duration: "2:18", size: "5.3 MB" },
  { file: "sample-03.mp4", duration: "2:38", size: "4.8 MB" },
] as const;

export function TestMaterials() {
  return (
    <div className={styles.materials} role="group" aria-label="测试素材下载">
      <div className={styles.submitRow}>
        <strong>
          测试素材 <small>3 条视频</small>
        </strong>
        <Button
          href={`${MATERIALS_PATH}/aios-shot-materials.zip`}
          download="aios-shot-materials.zip"
        >
          全部下载 · 17.1 MB
        </Button>
      </div>
      {VIDEOS.map(({ file, duration, size }) => (
        <div className={styles.materialRow} key={file}>
          <div>
            <span>{file}</span>
            <small>
              {duration} · {size}
            </small>
          </div>
          <Button
            type="link"
            size="large"
            href={`${MATERIALS_PATH}/${file}`}
            download={file}
            aria-label={`下载 ${file}`}
          >
            下载
          </Button>
        </div>
      ))}
      <span className={styles.questionNote}>
        ZIP 内含视频和作业说明。素材仅用于本次招聘测试，请勿外传。
      </span>
    </div>
  );
}
