import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
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
  "aiUsage",
  "videoPractice",
] as const satisfies readonly (keyof AiInternTestFormValues)[];

function required(label: string) {
  return [{ required: true, whitespace: true, message: `请填写${label}` }];
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
  const [form] = Form.useForm<AiInternTestFormValues>();
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
          aiUsage: values.aiUsage,
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
    <Form<AiInternTestFormValues>
      form={form}
      layout="vertical"
      initialValues={initialDraft.values}
      onValuesChange={handleValuesChange}
      onFinish={handleFinish}
      onFinishFailed={({ errorFields }) => {
        const first = errorFields[0]?.name;
        if (first) form.scrollToField(first, { block: "center" });
      }}
      scrollToFirstError={false}
      requiredMark
      className={styles.form}
    >
      <section className={styles.section} aria-labelledby="ai-intern-basic">
        <h2 id="ai-intern-basic" className={styles.sectionTitle}>
          基本信息
        </h2>
        <p className={styles.sectionHint}>{PRIVACY_NOTE}</p>
        <div className={styles.fieldGrid}>
          <Form.Item name="name" label="姓名" rules={required("姓名")}>
            <Input maxLength={40} autoComplete="name" />
          </Form.Item>
          <Form.Item
            name="schoolAndGrade"
            label="学校"
            rules={required("学校")}
          >
            <Input maxLength={100} placeholder="例如：某某大学" />
          </Form.Item>
          <Form.Item name="major" label="专业" rules={required("专业")}>
            <Input maxLength={100} placeholder="例如：计算机科学与技术" />
          </Form.Item>
          <Form.Item
            name="contact"
            label="联系方式"
            rules={required("联系方式")}
            extra="微信、手机号或邮箱，任选一种。"
          >
            <Input maxLength={100} />
          </Form.Item>
        </div>
        <Form.Item name="website" hidden>
          <Input tabIndex={-1} autoComplete="off" aria-hidden="true" />
        </Form.Item>
      </section>

      <section className={styles.section} aria-labelledby="assignment-title">
        <h2 id="assignment-title" className={styles.sectionTitle}>
          任务
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
          <h3 className={styles.subheading}>交付</h3>
          <p>可运行代码和一份说明：怎么运行、输出长什么样、做了哪些取舍。</p>
          <p>建议投入 2–3 小时；如超时，请注明实际用时及卡在哪一步。</p>
          <p>
            可选加分：做一个简单的预览页面或可视化输出，让人一眼能看出切分结果对不对。
          </p>
        </div>
      </section>
      {[
        {
          key: "videoPractice",
          question: VIDEO_PRACTICE_QUESTION,
          limit: 8000,
        },
        { key: "workflow", question: WORKFLOW_QUESTION, limit: 6000 },
      ].map(({ key, question, limit }) => (
        <section
          key={key}
          className={styles.section}
          aria-labelledby={`ai-intern-${key}`}
        >
          <h2 id={`ai-intern-${key}`} className={styles.sectionTitle}>
            {key === "videoPractice" ? "提交作业" : "AI 开发方式"}
          </h2>
          {key === "workflow" && (
            <div className={styles.questionBody}>
              <p>{question.intro}</p>
              <div>
                <ol className={styles.promptList}>
                  {question.prompts.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ol>
                <p className={styles.questionNote}>{question.note}</p>
              </div>
            </div>
          )}
          <Form.Item
            name={key}
            label={
              key === "videoPractice"
                ? "代码与输出链接、运行说明及验证结果"
                : "规则与实际使用说明"
            }
            rules={required(question.title)}
          >
            <Input.TextArea
              placeholder={
                key === "videoPractice"
                  ? "粘贴代码仓库或交付文件链接，并补充运行方法、设计取舍和验证结果。"
                  : "选出两三条规则，结合实际经历说明它们为什么有用。"
              }
              autoSize={{ minRows: 4, maxRows: 24 }}
              maxLength={limit}
              showCount
            />
          </Form.Item>
          {key === "workflow" ? (
            <details
              className={styles.rulesDisclosure}
              open={Boolean(initialDraft.values.workflowRules)}
            >
              <summary>附上开发规则或文件链接（选填）</summary>
              <Form.Item
                name="workflowRules"
                label="开发规则内容或链接（选填）"
                extra="可粘贴 AGENTS.md / CLAUDE.md 等文件的脱敏节选，也可在上方回答中描述。"
              >
                <Input.TextArea
                  className="font-mono"
                  autoSize={{ minRows: 3, maxRows: 24 }}
                  maxLength={10000}
                  showCount
                  spellCheck={false}
                />
              </Form.Item>
            </details>
          ) : null}
          {key === "workflow" ? (
            <Form.Item
              name="aiUsage"
              label="AI 使用说明"
              rules={required("AI 使用说明")}
              extra="简述本次答题使用了哪些 AI 工具、用于哪些部分，以及你亲自检查或修改了什么。未使用可写“未使用”。"
            >
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 10 }}
                maxLength={1500}
                showCount
              />
            </Form.Item>
          ) : null}
        </section>
      ))}

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
          >
            提交答卷
          </Button>
        </div>
        <p className={styles.sectionHint}>提交后不能修改，请确认内容完整。</p>
      </footer>
    </Form>
  );
}
