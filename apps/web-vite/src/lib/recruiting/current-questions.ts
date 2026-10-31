/** Candidate-facing V3 task. Internal rubric is served only to admins. */
export const AI_INTERN_TEST_KEY = "ai-intern";
export const AI_INTERN_QUESTION_SET_VERSION = 3;

export const VIDEO_PRACTICE_QUESTION = {
  title: "视频镜头切分",
  intro:
    "给你 3 条美妆类短视频（1–3 分钟，请下载下方测试素材）。写一个程序，一次运行批量处理这 3 条视频，把每条视频划分为镜头片段。镜头边界由你判断，请在说明中简述判断依据。",
  prompts: [
    "输出结果：给出每个镜头的起止时间和一张预览图，格式自定，无需另行导出视频。",
    "异常处理：考虑输入差异和处理失败；单条视频失败时，记录原因并继续处理其他视频。",
    "结果验证：展示一个实际切分结果，说明你如何检查它是否正确，并记录发现的问题。",
  ],
  note: "提交可运行代码、运行方法和主要设计取舍。附件视频仅用于本次测试，请勿外传。",
} as const;

export const WORKFLOW_QUESTION = {
  title: "AI 开发方式",
  intro:
    "选出你常用的两三条开发规则，说明它们解决过什么问题，可附脱敏节选或链接。没有现成规则，也可以结合本次作业整理，并注明。",
  prompts: [],
  note: "请勿提交密钥、客户信息或公司内部资料。",
} as const;

export const CLOSING_NOTE =
  "可以使用 AI 辅助，请如实说明个人贡献及 AI 的使用情况。";
export const PRIVACY_NOTE =
  "你填写的个人信息只用于本次招聘沟通，不会对外公开。";
