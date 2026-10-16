import type { BadgeStatus } from "@/components/atoms/badge";
import type {
  RecruitingReviewScores,
  RecruitingRubric,
} from "@/lib/generated-api-contract";

export type RecruitingVerdict = "advance" | "hold" | "reject";

export const VERDICT_LABELS: Record<RecruitingVerdict, string> = {
  advance: "优先技术面",
  hold: "待定 / 复核",
  reject: "不通过",
};

export const VERDICT_BADGE_STATUS: Record<RecruitingVerdict, BadgeStatus> = {
  advance: "success",
  hold: "warning",
  reject: "danger",
};

const LEGACY_ANSWER_SECTIONS = [
  { key: "project", label: "第一题：项目经历", code: false },
  { key: "videoTaskCode", label: "第二题：函数代码", code: true },
  { key: "videoTaskNotes", label: "第二题：设计思路", code: false },
  { key: "aiUsage", label: "第二题：AI 使用说明", code: false },
  { key: "remixPlan", label: "第三题：AI 视频裂变方案", code: false },
] as const;

const V2_ANSWER_SECTIONS = [
  { key: "workflow", label: "第一题：AI 开发工作流", code: false },
  { key: "workflowRules", label: "第一题：开发规则（选填）", code: true },
  { key: "project", label: "第二题：项目或 Demo", code: false },
  { key: "agentPlan", label: "第三题：自己的 Agent", code: false },
  { key: "aiUsage", label: "AI 使用说明", code: false },
] as const;

export function answerSections(version: number) {
  if (version === 1) return LEGACY_ANSWER_SECTIONS;
  if (version === 2) return V2_ANSWER_SECTIONS;
  if (version === 3)
    return [
      { key: "videoPractice", label: "视频镜头切分：交付与验证", code: false },
      { key: "workflow", label: "AI 开发方式与规则说明", code: false },
      { key: "workflowRules", label: "开发规则（选填）", code: true },
      { key: "aiUsage", label: "AI 使用说明", code: false },
    ] as const;
  throw new Error("不支持的题目版本");
}

export function isVerdict(value: string): value is RecruitingVerdict {
  return value === "advance" || value === "hold" || value === "reject";
}

export function totalScore(scores: RecruitingReviewScores): number {
  return scores.project + scores.asyncLogic + scores.robustness + scores.design;
}

/** Live preview only; the saved verdict always comes from the backend. */
export function previewVerdict(
  scores: RecruitingReviewScores,
  thresholds: RecruitingRubric["thresholds"],
): RecruitingVerdict {
  if (scores.asyncLogic + scores.robustness < thresholds.videoTaskMin) {
    return "reject";
  }
  const total = totalScore(scores);
  if (total >= thresholds.advanceMin) return "advance";
  if (total >= thresholds.holdMin) return "hold";
  return "reject";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

export function formatReviewSummary(args: {
  candidateName: string;
  scores: RecruitingReviewScores;
  rubric: RecruitingRubric;
  verdict: RecruitingVerdict;
  note: string;
}): string {
  const { candidateName, scores, rubric, verdict, note } = args;
  const lines = [
    `候选人：${candidateName}`,
    `总分：${totalScore(scores)} / 100（${VERDICT_LABELS[verdict]}）`,
    ...rubric.dimensions.map(
      (dimension) =>
        `${dimension.label}：${scores[dimension.key as keyof RecruitingReviewScores]} / ${dimension.max}`,
    ),
  ];
  if (note.trim()) lines.push(`备注：${note.trim()}`);
  return lines.join("\n");
}
