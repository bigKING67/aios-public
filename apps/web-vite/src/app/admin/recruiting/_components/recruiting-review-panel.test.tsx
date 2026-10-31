import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobeProvider } from "@/components/lobe-provider";
import type {
  RecruitingRubric,
  RecruitingSubmissionDetail,
} from "@/lib/generated-api-contract";
import { RecruitingReviewPanel } from "./recruiting-review-panel";

const save = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
}));
vi.mock("../_lib/recruiting-api", () => ({
  useSaveRecruitingReview: () => save,
}));

const RUBRIC: RecruitingRubric = {
  dimensions: [
    { key: "project", label: "项目经历", max: 30, guidance: "看真实项目" },
    { key: "asyncLogic", label: "异步逻辑", max: 25, guidance: "看并发" },
    { key: "robustness", label: "健壮性", max: 20, guidance: "看边界" },
    { key: "design", label: "设计", max: 25, guidance: "看取舍" },
  ],
  thresholds: { advanceMin: 80, holdMin: 65, videoTaskMin: 30 },
  videoTaskCheckpoints: [],
  strongSignals: "",
  averageSignals: "",
  weakSignals: "",
  interviewFollowUp: "",
};

const SUBMISSION = {
  submissionId: "00000000-0000-0000-0000-000000000001",
  testKey: "ai-intern",
  questionSetVersion: 3,
  candidate: { name: "张三" },
  answers: {},
  startedAt: null,
  submittedAt: "2026-10-01T08:00:00Z",
  durationSeconds: 1800,
  review: null,
} as unknown as RecruitingSubmissionDetail;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecruitingReviewPanel", () => {
  it("names every score control and saves the scores with the note", async () => {
    const user = userEvent.setup();
    render(
      <LobeProvider>
        <RecruitingReviewPanel submission={SUBMISSION} rubric={RUBRIC} />
      </LobeProvider>,
    );
    expect(screen.getByText("待评分")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "项目经历" })).toBeInTheDocument();

    const project = screen.getByRole("textbox", { name: "项目经历" });
    await user.clear(project);
    await user.type(project, "28");
    await user.tab();
    await user.type(screen.getByLabelText("备注"), "  追问缓存  ");
    await user.click(screen.getByRole("button", { name: "保存评分" }));

    expect(save.mutate).toHaveBeenCalledWith(
      {
        scores: { project: 28, asyncLogic: 0, robustness: 0, design: 0 },
        note: "追问缓存",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(
      screen.getByText("第二题两项合计低于 30 分，按规则不通过"),
    ).toBeInTheDocument();
  });
});
