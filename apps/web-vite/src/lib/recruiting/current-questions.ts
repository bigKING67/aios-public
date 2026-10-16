/** Candidate-facing V3 task. Internal rubric is served only to admins. */
export const AI_INTERN_TEST_KEY = "ai-intern";
export const AI_INTERN_QUESTION_SET_VERSION = 3;

export const VIDEO_PRACTICE_QUESTION = {
  title: "视频镜头切分",
  intro:
    "给你 3 条美妆类短视频（1–3 分钟，请下载下方测试素材）。写一个程序，一次运行批量处理这 3 条视频，把每条视频划分为镜头片段。镜头边界由你判断，请在说明中简述判断依据。",
  prompts: [
    "输出每个镜头的开始时间、结束时间，以及一张预览图；不强制导出独立视频文件。",
    "输出格式由你定，并说明为什么这样设计。",
    "考虑输入差异与异常情况，例如分辨率、帧率、是否有音轨，以及单条视频处理失败。",
    "展示你如何检查切分结果，指出一个处理得较好或仍不理想的片段，并说明原因。",
  ],
  note: "交付可运行代码和一份说明：怎么运行、输出长什么样、做了哪些取舍。建议投入 2–3 小时；如超时，请注明实际用时及卡在哪一步。可选加分：做一个简单的预览页面或可视化输出，让人一眼能看出切分结果对不对。附件视频仅用于本次测试，请勿外传。",
} as const;

export const WORKFLOW_QUESTION = {
  title: "最后一问：你的 AI 开发方式",
  intro:
    "可以提交正在使用的 AGENTS.md、CLAUDE.md、Cursor Rules 或其他开发规则，选出最有用的两三条，说明为什么会有这些规则，以及它们解决过什么实际问题。",
  prompts: [
    "如果没有现成规则，也可以结合这次作业整理两三条，并注明是本次新整理的。",
    "请在 AI 使用说明中简述本次使用了哪些工具、用于哪些环节，以及你亲自检查或修改了什么。未使用 AI 可如实说明。",
  ],
  note: "规则文件可节选、脱敏，不要提交密钥、客户信息或公司内部资料。我们关注实际作用，不看篇幅长短或工具数量。",
} as const;

export const CLOSING_NOTE =
  "可以使用 AI 辅助，请如实说明个人贡献及 AI 的使用情况。";
export const PRIVACY_NOTE =
  "你填写的个人信息只用于本次招聘沟通，不会对外公开。";
