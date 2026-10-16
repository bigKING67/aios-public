import { useEffect, useState } from "react";
import { Result } from "antd";
import type { RecruitingPublicSubmissionResponse } from "@/lib/generated-api-contract";
import { AiInternTestForm } from "./ai-intern-test-form";
import styles from "../ai-intern-test.module.css";

const PAGE_TITLE = "AI 应用开发实习生在线测试";

export function AiInternTestPage() {
  const [submitted, setSubmitted] =
    useState<RecruitingPublicSubmissionResponse | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${PAGE_TITLE} · AGI AIOS`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handleSubmitted = (result: RecruitingPublicSubmissionResponse) => {
    setSubmitted(result);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <img src="/favicon.png" alt="" width={28} height={28} />
            <span>AGI AIOS · 招聘</span>
          </div>
          <p className={styles.eyebrow}>AI 应用开发实习生 · 在线测试</p>
          <h1 className={styles.title}>视频镜头切分</h1>
          <p className={styles.lead}>
            我们在做一个短视频自动裂变系统。第一步是把一条成品视频切成镜头片段，
            后面才能做打标、检索和重新组合。这次作业就是把这一步做出来。
          </p>
          <ul className={styles.facts} aria-label="作答说明">
            <li>建议 2–3 小时</li>
            <li>编程语言不限</li>
            <li>可使用 AI</li>
          </ul>
        </header>

        {submitted ? (
          <section className={styles.section} aria-live="polite">
            <Result
              status="success"
              title="答卷已提交"
              subTitle={`提交时间 ${new Date(submitted.submittedAt).toLocaleString("zh-CN")}。我们会通过你留下的联系方式与你联系，感谢你的时间。`}
            />
          </section>
        ) : (
          <AiInternTestForm onSubmitted={handleSubmitted} />
        )}
      </div>
    </main>
  );
}
