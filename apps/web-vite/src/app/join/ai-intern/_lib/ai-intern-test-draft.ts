/**
 * 本机草稿：候选人刷新或误关页面后能继续作答。只存在浏览器 localStorage，
 * 提交成功后清除。
 */
import { AI_INTERN_QUESTION_SET_VERSION } from "./ai-intern-test-copywriting";

export type AiInternTestFormValues = {
  name: string;
  contact: string;
  schoolAndGrade: string;
  major: string;
  workflow: string;
  workflowRules: string;
  aiUsage: string;
  videoPractice: string;
  website: string;
};

export type AiInternTestDraft = {
  version: number;
  /** Client-generated so a retried POST after a lost response is idempotent. */
  submissionId: string;
  startedAt: string;
  savedAt: string | null;
  values: Partial<AiInternTestFormValues>;
};

const DRAFT_STORAGE_KEY = `aios.join.ai-intern.draft.v${AI_INTERN_QUESTION_SET_VERSION}.shot`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(now: Date = new Date()): AiInternTestDraft {
  const fresh: AiInternTestDraft = {
    version: AI_INTERN_QUESTION_SET_VERSION,
    submissionId: crypto.randomUUID(),
    startedAt: now.toISOString(),
    savedAt: null,
    values: {},
  };
  const raw = storage()?.getItem(DRAFT_STORAGE_KEY);
  if (!raw) {
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AiInternTestDraft>;
    if (
      parsed.version !== AI_INTERN_QUESTION_SET_VERSION ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.submissionId !== "string" ||
      typeof parsed.values !== "object" ||
      parsed.values === null
    ) {
      return fresh;
    }
    return {
      version: AI_INTERN_QUESTION_SET_VERSION,
      submissionId: parsed.submissionId,
      startedAt: parsed.startedAt,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
      values: parsed.values,
    };
  } catch {
    return fresh;
  }
}

/** Returns false when the browser refuses storage (private mode, quota). */
export function saveDraft(draft: AiInternTestDraft): boolean {
  try {
    storage()?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return storage() !== null;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
