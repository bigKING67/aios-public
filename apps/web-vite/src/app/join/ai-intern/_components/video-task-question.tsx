import { App, Button } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/copy-text";
import {
  VIDEO_TASK_MOCK_SOURCE,
  VIDEO_TASK_QUESTION,
} from "../_lib/ai-intern-test-legacy-copywriting";
import styles from "../ai-intern-test.module.css";

export function VideoTaskQuestion() {
  const { message } = App.useApp();

  const handleCopyMock = () => {
    void copyText(VIDEO_TASK_MOCK_SOURCE).then((copied) => {
      if (copied) {
        message.success("模拟接口已复制");
      } else {
        message.error("复制失败，请手动选中代码复制");
      }
    });
  };

  return (
    <div className={styles.questionBody}>
      <p>{VIDEO_TASK_QUESTION.scenario}</p>
      <p>{VIDEO_TASK_QUESTION.apiIntro}</p>
      <dl className={styles.apiList}>
        {VIDEO_TASK_QUESTION.apis.map((api) => (
          <div key={api.signature} className={styles.apiItem}>
            <dt>
              <code className={styles.inlineCode}>{api.signature}</code>
            </dt>
            <dd>{api.description}</dd>
          </div>
        ))}
      </dl>
      <p>{VIDEO_TASK_QUESTION.taskIntro}</p>
      <ol className={styles.promptList}>
        {VIDEO_TASK_QUESTION.requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ol>
      <p className={styles.questionNote}>{VIDEO_TASK_QUESTION.note}</p>
      <div className={styles.mockBlock}>
        <div className={styles.mockHeader}>
          <p className={styles.mockIntro}>{VIDEO_TASK_QUESTION.mockIntro}</p>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopyMock}>
            复制代码
          </Button>
        </div>
        <pre
          className={styles.codeBlock}
          tabIndex={0}
          aria-label="模拟接口代码"
        >
          <code>{VIDEO_TASK_MOCK_SOURCE}</code>
        </pre>
      </div>
    </div>
  );
}
