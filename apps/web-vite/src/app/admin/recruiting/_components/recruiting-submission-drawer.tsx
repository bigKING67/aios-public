import { Alert, Descriptions, Drawer, Spin } from "antd";
import { questionHistory } from "@/lib/recruiting/question-history";
import { useIsMobile } from "@/hooks/use-media-query";
import { resolveClientErrorMessage } from "@/lib/client-error";
import type {
  RecruitingRubric,
  RecruitingSubmissionDetail,
} from "@/lib/generated-api-contract";
import {
  useRecruitingRubric,
  useRecruitingSubmission,
} from "../_lib/recruiting-api";
import {
  answerSections,
  formatDuration,
} from "../_lib/recruiting-review-model";
import { RecruitingReviewPanel } from "./recruiting-review-panel";
import { recruitingClasses as styles } from "../_lib/recruiting-classes";

type RecruitingSubmissionDrawerProps = {
  submissionId: string | null;
  onClose: () => void;
};

export function RecruitingSubmissionDrawer({
  submissionId,
  onClose,
}: RecruitingSubmissionDrawerProps) {
  const isMobile = useIsMobile();
  const submission = useRecruitingSubmission(submissionId);
  const rubric = useRecruitingRubric(submission.data?.questionSetVersion);
  const error = submission.error ?? rubric.error;

  return (
    <Drawer
      open={submissionId !== null}
      onClose={onClose}
      size={isMobile ? "100%" : 960}
      title={
        submission.data ? `答卷：${submission.data.candidate.name}` : "答卷详情"
      }
      destroyOnHidden
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title={resolveClientErrorMessage(error, "答卷加载失败，请稍后重试")}
        />
      ) : submission.data && rubric.data ? (
        <SubmissionContent submission={submission.data} rubric={rubric.data} />
      ) : (
        <div className={styles.drawerLoading}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function SubmissionContent({
  submission,
  rubric,
}: {
  submission: RecruitingSubmissionDetail;
  rubric: RecruitingRubric;
}) {
  const { candidate } = submission;
  return (
    <div className={styles.drawerLayout}>
      <div className={styles.drawerMain}>
        <section className={styles.drawerSection}>
          <h3 className={styles.drawerSectionTitle}>
            候选人信息 · 题目 V{submission.questionSetVersion}
          </h3>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="姓名">{candidate.name}</Descriptions.Item>
            <Descriptions.Item label="联系方式">
              {candidate.contact}
            </Descriptions.Item>
            <Descriptions.Item
              label={submission.questionSetVersion >= 3 ? "学校" : "学校与年级"}
            >
              {candidate.schoolAndGrade}
            </Descriptions.Item>
            {submission.questionSetVersion >= 3 ? (
              <Descriptions.Item label="专业">
                {candidate.major || "—"}
              </Descriptions.Item>
            ) : (
              <>
                <Descriptions.Item label="每周到岗">
                  {candidate.weeklyAvailability}
                </Descriptions.Item>
                <Descriptions.Item label="最早到岗">
                  {candidate.earliestStart}
                </Descriptions.Item>
                <Descriptions.Item label="作品链接">
                  {candidate.portfolioUrl ? (
                    <a
                      href={candidate.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {candidate.portfolioUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="提交时间">
              {new Date(submission.submittedAt).toLocaleString("zh-CN")}
            </Descriptions.Item>
            <Descriptions.Item label="作答用时">
              {formatDuration(submission.durationSeconds)}
            </Descriptions.Item>
          </Descriptions>
        </section>

        {answerSections(submission.questionSetVersion).map((section) => (
          <section key={section.key} className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{section.label}</h3>
            <pre
              className={section.code ? styles.answerCode : styles.answerText}
              tabIndex={section.code ? 0 : undefined}
            >
              {submission.answers[section.key] || "未填写"}
            </pre>
          </section>
        ))}
      </div>

      <aside className={styles.drawerSide} aria-label="评分">
        <section className={styles.drawerSection}>
          <h3 className={styles.drawerSectionTitle}>面试官评分</h3>
          <RecruitingReviewPanel
            key={`${submission.submissionId}:${submission.review?.reviewedAt ?? "new"}`}
            submission={submission}
            rubric={rubric}
          />
        </section>
        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            原始题目 · V{submission.questionSetVersion}
          </summary>
          <div className={styles.disclosureBody}>
            {questionHistory(submission.questionSetVersion).map(
              (text, index) => (
                <pre key={index} className={styles.answerText}>
                  {text}
                </pre>
              ),
            )}
          </div>
        </details>
        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            {submission.questionSetVersion === 1
              ? "第二题隐藏检查点"
              : "答卷核验与面试追问"}
          </summary>
          <div className={styles.disclosureBody}>
            <ul className={styles.rubricList}>
              {rubric.videoTaskCheckpoints.map((checkpoint) => (
                <li key={checkpoint}>{checkpoint}</li>
              ))}
            </ul>
          </div>
        </details>
        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            筛选信号与技术面建议
          </summary>
          <dl className={`${styles.rubricSignals} ${styles.disclosureBody}`}>
            <dt className={styles.rubricSignalTerm}>优秀</dt>
            <dd>{rubric.strongSignals}</dd>
            <dt className={styles.rubricSignalTerm}>一般</dt>
            <dd>{rubric.averageSignals}</dd>
            <dt className={styles.rubricSignalTerm}>不太合适</dt>
            <dd>{rubric.weakSignals}</dd>
            <dt className={styles.rubricSignalTerm}>技术面</dt>
            <dd>{rubric.interviewFollowUp}</dd>
          </dl>
        </details>
      </aside>
    </div>
  );
}
