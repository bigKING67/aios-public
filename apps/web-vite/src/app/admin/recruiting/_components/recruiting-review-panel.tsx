import { useState } from "react";
import { Alert, Button, InputNumber, Slider, TextArea, toast } from "@lobehub/ui";
import { Copy } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { copyText } from "@/lib/copy-text";
import { resolveClientErrorMessage } from "@/lib/client-error";
import type {
  RecruitingReviewScores,
  RecruitingRubric,
  RecruitingSubmissionDetail,
} from "@/lib/generated-api-contract";
import { useSaveRecruitingReview } from "../_lib/recruiting-api";
import {
  VERDICT_BADGE_STATUS,
  VERDICT_LABELS,
  formatReviewSummary,
  previewVerdict,
  totalScore,
} from "../_lib/recruiting-review-model";
import { recruitingClasses as styles } from "../_lib/recruiting-classes";

const EMPTY_SCORES: RecruitingReviewScores = {
  project: 0,
  asyncLogic: 0,
  robustness: 0,
  design: 0,
};

type RecruitingReviewPanelProps = {
  submission: RecruitingSubmissionDetail;
  rubric: RecruitingRubric;
};

export function RecruitingReviewPanel({
  submission,
  rubric,
}: RecruitingReviewPanelProps) {
  const [scores, setScores] = useState<RecruitingReviewScores>(
    submission.review?.scores ?? EMPTY_SCORES,
  );
  const [note, setNote] = useState(submission.review?.note ?? "");
  // Unreviewed answers show 待评分 until the interviewer touches a score.
  const [touched, setTouched] = useState(
    submission.review !== null && submission.review !== undefined,
  );
  const saveReview = useSaveRecruitingReview(submission.submissionId);

  const total = totalScore(scores);
  const verdict = previewVerdict(scores, rubric.thresholds);
  const videoTaskVetoed =
    touched &&
    scores.asyncLogic + scores.robustness < rubric.thresholds.videoTaskMin;

  const updateScore = (
    key: keyof RecruitingReviewScores,
    max: number,
    value: number | null,
  ) => {
    const clamped = Math.min(max, Math.max(0, Math.round(value ?? 0)));
    setTouched(true);
    setScores((current) => ({ ...current, [key]: clamped }));
  };

  const handleSave = () => {
    saveReview.mutate(
      { scores, note: note.trim() || null },
      { onSuccess: () => toast.success("评分已保存") },
    );
  };

  const handleCopy = () => {
    const summary = formatReviewSummary({
      candidateName: submission.candidate.name,
      scores,
      rubric,
      verdict,
      note,
    });
    void copyText(summary).then((copied) => {
      if (copied) toast.success("评分结果已复制");
      else toast.error("复制失败，请手动复制");
    });
  };

  return (
    <div className={styles.reviewPanel}>
      <div className={styles.scoreSummary}>
        <div>
          <span className={styles.scoreTotal}>{total}</span>
          <span className={styles.scoreMax}> / 100</span>
        </div>
        {touched ? (
          <Badge status={VERDICT_BADGE_STATUS[verdict]}>
            {VERDICT_LABELS[verdict]}
          </Badge>
        ) : (
          <Badge status="neutral">待评分</Badge>
        )}
      </div>
      {videoTaskVetoed ? (
        <Alert
          type="warning"
          showIcon
          title={`第二题两项合计低于 ${rubric.thresholds.videoTaskMin} 分，按规则不通过`}
        />
      ) : null}

      {rubric.dimensions.map((dimension) => {
        const key = dimension.key as keyof RecruitingReviewScores;
        return (
          <div key={dimension.key} className={styles.dimension}>
            <div className={styles.dimensionHeader}>
              <label
                id={`recruiting-score-${dimension.key}-label`}
                htmlFor={`recruiting-score-${dimension.key}`}
                className={styles.dimensionLabel}
              >
                {dimension.label}
              </label>
              <span className={styles.dimensionValue}>
                <InputNumber
                  id={`recruiting-score-${dimension.key}`}
                  size="small"
                  min={0}
                  max={dimension.max}
                  precision={0}
                  value={scores[key]}
                  onChange={(value) => updateScore(key, dimension.max, value)}
                />
                <span> / {dimension.max}</span>
              </span>
            </div>
            <Slider
              min={0}
              max={dimension.max}
              value={scores[key]}
              onChange={(value) => updateScore(key, dimension.max, value)}
              // lobe Slider puts aria-label on its group; aria-labelledby reaches the thumb input.
              aria-labelledby={`recruiting-score-${dimension.key}-label`}
            />
            <p className={styles.dimensionGuidance}>{dimension.guidance}</p>
          </div>
        );
      })}

      <label htmlFor="recruiting-review-note" className={styles.dimensionLabel}>
        备注
      </label>
      <TextArea
        id="recruiting-review-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        autoSize={{ minRows: 3, maxRows: 10 }}
        maxLength={4000}
        placeholder="面试关注点、需要现场追问的问题等"
      />
      {saveReview.isError ? (
        <Alert
          type="error"
          showIcon
          title={resolveClientErrorMessage(
            saveReview.error,
            "保存失败，请稍后重试",
          )}
        />
      ) : null}
      <div className={styles.reviewActions}>
        <Button
          type="primary"
          loading={saveReview.isPending}
          onClick={handleSave}
        >
          保存评分
        </Button>
        <Button icon={<Copy size={16} strokeWidth={1.8} aria-hidden="true" />} onClick={handleCopy}>
          复制评分结果
        </Button>
      </div>
      {submission.review ? (
        <p className={styles.reviewMeta}>
          上次保存：{submission.review.reviewedBy ?? "—"} ·{" "}
          {new Date(submission.review.reviewedAt).toLocaleString("zh-CN")}
        </p>
      ) : null}
    </div>
  );
}
