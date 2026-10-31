import { describe, expect, it } from "vitest";
import { answerSections, previewVerdict } from "./recruiting-review-model";
import { questionHistory } from "@/lib/recruiting/question-history";

describe("versioned recruiting review", () => {
  it("keeps the original questions and answer labels for old submissions", () => {
    expect(answerSections(1).map((s) => s.key)).toContain("videoTaskCode");
    expect(questionHistory(1)[1]).toContain("generateVideo");
    expect(answerSections(2).map((s) => s.key)).toEqual([
      "workflow",
      "workflowRules",
      "project",
      "agentPlan",
      "aiUsage",
    ]);
    expect(questionHistory(2).join("\n")).not.toContain("generateVideo");
    expect(answerSections(3).map((s) => s.key)).toContain("videoPractice");
    expect(questionHistory(3)).toHaveLength(2);
    expect(questionHistory(2)).toHaveLength(3);
    expect(questionHistory(2)[2]).toContain("第三题：");
    expect(questionHistory(3)[0]).toContain("视频镜头切分");
    expect(answerSections(3).map((s) => s.key)).not.toContain("agentPlan");
    expect(() => answerSections(4)).toThrow();
  });
  it("applies legacy veto only when the versioned rubric requires it", () => {
    const scores = { project: 25, asyncLogic: 10, robustness: 10, design: 25 };
    const thresholds = { advanceMin: 80, holdMin: 65, videoTaskMin: 30 };
    expect(previewVerdict(scores, thresholds)).toBe("reject");
    expect(previewVerdict(scores, { ...thresholds, videoTaskMin: 0 })).toBe(
      "hold",
    );
  });
  it("shows the separate AI answer only when it exists in a V3 submission", () => {
    expect(answerSections(3, "").map((section) => section.key)).not.toContain("aiUsage");
    expect(answerSections(3, "  ").map((section) => section.key)).not.toContain("aiUsage");
    expect(answerSections(3, "AI 写初稿，我检查切点").map((section) => section.key)).toContain("aiUsage");
    expect(answerSections(2, "").map((section) => section.key)).toContain("aiUsage");
  });
});
