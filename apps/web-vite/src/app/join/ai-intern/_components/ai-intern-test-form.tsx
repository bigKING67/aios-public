import { type ComponentProps, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, TextArea } from '@lobehub/ui';
import { ArrowRight } from 'lucide-react';
import { FormField } from "@/components/molecules/form-field";
import { bindTextField, type ControlledFormRules, useControlledForm } from "@/hooks/use-controlled-form";
import { resolveClientErrorMessage } from "@/lib/client-error";
import type { RecruitingPublicSubmissionResponse } from "@/lib/generated-api-contract";
import { submitAiInternTest } from "../_lib/ai-intern-test-api";
import {
  AI_INTERN_QUESTION_SET_VERSION,
  AI_INTERN_TEST_KEY,
  PRIVACY_NOTE,
  WORKFLOW_QUESTION,
  VIDEO_PRACTICE_QUESTION,
} from "../_lib/ai-intern-test-copywriting";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type AiInternTestFormValues,
} from "../_lib/ai-intern-test-draft";
import { TestMaterials } from "./test-materials";
import styles from "../ai-intern-test.module.css";

const DRAFT_SAVE_DELAY_MS = 600;

const REQUIRED_FIELDS = [
  "name",
  "contact",
  "schoolAndGrade",
  "major",
  "workflow",
  "videoPractice",
] as const satisfies readonly (keyof AiInternTestFormValues)[];

function required(label: string) {
  const message = `请填写${label}`;
  // Whitespace-only answers count as empty, like the antd `whitespace` rule this replaces.
  return [{ required: true, message, validator: (value: unknown) => String(value ?? "").trim().length > 0 }];
}

const RULES: ControlledFormRules<AiInternTestFormValues> = {
  name: required("姓名"),
  schoolAndGrade: required("学校"),
  major: required("专业"),
  contact: required("联系方式"),
  videoPractice: required("作业链接与说明"),
  workflow: required("开发规则与说明"),
};

/** Answer box with a character count (lobe TextArea has no `showCount`). */
function CountedTextArea({
  count,
  limit,
  ...props
}: ComponentProps<typeof TextArea> & { count: number; limit: number }) {
  return (
    <div className={styles.countedField}>
      <TextArea {...props} maxLength={limit} />
      <span className={styles.charCount} aria-hidden="true">
        {count}/{limit}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countFilled(values: Partial<AiInternTestFormValues>): number {
  return REQUIRED_FIELDS.filter(
    (field) => (values[field] ?? "").trim().length > 0,
  ).length;
}

type AiInternTestFormProps = {
  onSubmitted: (result: RecruitingPublicSubmissionResponse) => void;
};

export function AiInternTestForm({ onSubmitted }: AiInternTestFormProps) {
  const initialDraft = useMemo(() => loadDraft(), []);
  const [savedAt, setSavedAt] = useState<string | null>(initialDraft.savedAt);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [filledCount, setFilledCount] = useState(() =>
    countFilled(initialDraft.values),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const handleValuesChange = (
    _changed: unknown,
    values: AiInternTestFormValues,
  ) => {
    setFilledCount(countFilled(values));
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const now = new Date().toISOString();
      const saved = saveDraft({ ...initialDraft, savedAt: now, values });
      setStorageBlocked(!saved);
      if (saved) setSavedAt(now);
    }, DRAFT_SAVE_DELAY_MS);
  };

  const form = useControlledForm<AiInternTestFormValues>({
    initialValues: initialDraft.values as AiInternTestFormValues,
    rules: RULES,
    onValuesChange: (changed, values) => handleValuesChange(changed, values),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.validateFields().then(
      (values) => void handleFinish(values),
      () => {
        const first = REQUIRED_FIELDS.find((field) => form.errors[field]);
        if (first) document.getElementById(form.fieldId(first))?.scrollIntoView({ block: "center" });
      },
    );
  };
  const answerLength = (field: keyof AiInternTestFormValues) => (form.values[field] ?? "").length;

  const handleFinish = async (values: AiInternTestFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitAiInternTest({
        submissionId: initialDraft.submissionId,
        testKey: AI_INTERN_TEST_KEY,
        questionSetVersion: AI_INTERN_QUESTION_SET_VERSION,
        startedAt: initialDraft.startedAt,
        website: values.website || null,
        candidate: {
          name: values.name,
          contact: values.contact,
          schoolAndGrade: values.schoolAndGrade,
          major: values.major,
          weeklyAvailability: "",
          earliestStart: "",
          portfolioUrl: null,
        },
        answers: {
          project: "",
          videoTaskCode: "",
          videoTaskNotes: "",
          remixPlan: "",
          workflow: values.workflow,
          workflowRules: values.workflowRules || "",
          // Preserve answers from existing drafts without requiring a separate field.
          aiUsage: values.aiUsage || "",
          agentPlan: "",
          videoPractice: values.videoPractice,
        },
      });
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      clearDraft();
      onSubmitted(result);
    } catch (error) {
      setSubmitError(
        resolveClientErrorMessage(
          error,
          "提交失败，请稍后重试。已填写的内容保存在本机，不会丢失。",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <section className={styles.section} aria-labelledby="ai-intern-basic">
        <h2 id="ai-intern-basic" className={styles.sectionTitle}>
          <span className={styles.sectionIndex} aria-hidden="true">01</span>
          基本信息
        </h2>
        <p className={styles.sectionHint}>{PRIVACY_NOTE}</p>
        <div className={styles.fieldGrid}>
          <FormField form={form} name="name" label="姓名" required>
            <Input {...bindTextField(form, "name")} size="large" maxLength={40} autoComplete="name" />
          </FormField>
          <FormField form={form} name="schoolAndGrade" label="学校" required>
            <Input {...bindTextField(form, "schoolAndGrade")} size="large" maxLength={100} placeholder="例如：某某大学" />
          </FormField>
          <FormField form={form} name="major" label="专业" required>
            <Input {...bindTextField(form, "major")} size="large" maxLength={100} placeholder="例如：计算机科学与技术" />
          </FormField>
          <FormField form={form} name="contact" label="联系方式" required>
            <Input {...bindTextField(form, "contact")} size="large" maxLength={100} placeholder="微信、手机号或邮箱，任选一种。" />
          </FormField>
        </div>
        {/* Honeypot: hidden from people and assistive tech; bots that fill it are rejected server-side. */}
        <div hidden>
          <input
            {...bindTextField(form, "website")}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="assignment-title">
        <h2 id="assignment-title" className={styles.sectionTitle}>
          <span className={styles.sectionIndex} aria-hidden="true">02</span>
          视频任务与交付
        </h2>
        <div className={styles.questionBody}>
          <p>{VIDEO_PRACTICE_QUESTION.intro}</p>
          <TestMaterials />
          <h3 className={styles.subheading}>要求</h3>
          <ol className={styles.promptList}>
            {VIDEO_PRACTICE_QUESTION.prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ol>
          <p>提交可运行代码、运行方法和主要设计取舍。</p>
        </div>
        <FormField form={form} name="videoPractice" required label="作业链接与说明">
          <CountedTextArea
            {...bindTextField(form, "videoPractice")}
            placeholder="粘贴代码仓库或文件链接，并补充运行方法、输出示例和验证结果。"
            autoSize={{ minRows: 4, maxRows: 24 }}
            limit={8000}
            count={answerLength("videoPractice")}
          />
        </FormField>
      </section>

      <section className={styles.section} aria-labelledby="ai-intern-workflow">
        <h2 id="ai-intern-workflow" className={styles.sectionTitle}>
          <span className={styles.sectionIndex} aria-hidden="true">03</span>
          AI 开发方式
        </h2>
        <div className={styles.questionBody}>
          <p>{WORKFLOW_QUESTION.intro}</p>
          <p className={styles.questionNote}>{WORKFLOW_QUESTION.note}</p>
        </div>
        <FormField form={form} name="workflow" required label="开发规则与说明">
          <CountedTextArea
            {...bindTextField(form, "workflow")}
            placeholder="例如 AGENTS.md、CLAUDE.md、Cursor Rules 中的规则节选或链接，以及它们解决过的实际问题。"
            autoSize={{ minRows: 4, maxRows: 24 }}
            limit={20000}
            count={answerLength("workflow")}
          />
        </FormField>
      </section>

      <footer className={styles.submitBar}>
        {submitError ? (
          <Alert type="error" showIcon title={submitError} />
        ) : null}
        <div className={styles.submitRow}>
          <p className={styles.draftStatus} aria-live="polite">
            已填写 {filledCount}/{REQUIRED_FIELDS.length} 项必填
            {storageBlocked
              ? " · 浏览器未允许保存草稿，请勿关闭页面"
              : savedAt
                ? ` · 草稿已保存在本机（${formatTime(savedAt)}）`
                : ""}
          </p>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            loading={submitting}
            disabled={submitting}
          >
            提交答卷
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
        <p className={styles.sectionHint}>提交后不能修改，请确认内容完整。</p>
      </footer>
    </form>
  );
}
