// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./ai-intern-test-draft";

afterEach(() => localStorage.clear());

describe("versioned candidate drafts", () => {
  it("does not map or overwrite V1 answers as V3 answers", () => {
    const old = JSON.stringify({
      version: 1,
      values: { project: "old project", videoTaskCode: "old code" },
    });
    localStorage.setItem("aios.join.ai-intern.draft", old);
    localStorage.setItem(
      "aios.join.ai-intern.draft.v2",
      JSON.stringify({ version: 2, values: { workflow: "old workflow" } }),
    );
    localStorage.setItem("aios.join.ai-intern.draft.v3", "unpublished four-question draft");
    const draft = loadDraft();
    expect(draft.version).toBe(3);
    expect(draft.values).toEqual({});
    expect(saveDraft({ ...draft, values: { workflow: "my workflow" } })).toBe(
      true,
    );
    expect(loadDraft().values.workflow).toBe("my workflow");
    clearDraft();
    expect(localStorage.getItem("aios.join.ai-intern.draft.v2")).toContain(
      "old workflow",
    );
    expect(localStorage.getItem("aios.join.ai-intern.draft")).toBe(old);
    expect(localStorage.getItem("aios.join.ai-intern.draft.v3")).toBe("unpublished four-question draft");
  });

  it("retains retry identity and answers after reload", () => {
    const draft = loadDraft();
    saveDraft({
      ...draft,
      values: {
        workflow: "flow",
        major: "计算机科学",
        contact: "wechat_candidate",
        videoPractice: "video result",
        aiUsage: "AI",
      },
    });
    expect(loadDraft().submissionId).toBe(draft.submissionId);
    expect(loadDraft().values.videoPractice).toBe("video result");
    expect(loadDraft().values.workflow).toBe("flow");
    expect(loadDraft().values.major).toBe("计算机科学");
    expect(loadDraft().values.contact).toBe("wechat_candidate");
  });
});
