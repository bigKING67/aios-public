/**
 * 候选人可见的题目文案。内部评分标准只由管理员接口下发，不放在这里。
 * 修改题目内容时同步提升 QUESTION_SET_VERSION（后端 domain.rs 同名常量）。
 */
export const AI_INTERN_TEST_KEY = "ai-intern";
export const AI_INTERN_QUESTION_SET_VERSION = 1;

export const TEST_FACTS = [
  { label: "建议用时", value: "45–60 分钟，不限时" },
  { label: "可用语言", value: "JavaScript / TypeScript" },
  {
    label: "允许工具",
    value: "Claude Code、Codex、Cursor、ChatGPT 等 AI 工具",
  },
  { label: "提交方式", value: "在线填写，可附 GitHub、项目或演示链接" },
] as const;

export const PROJECT_QUESTION = {
  title: "第一题：你做过什么项目？",
  intro:
    "请介绍一个你独立开发或深度参与过的项目，AI 应用、网站、自动化工具、个人产品均可。",
  prompts: [
    "你具体负责哪些部分？使用了什么技术？",
    "项目解决了什么问题？实现了哪些核心功能？",
    "开发过程中遇到的一个实际问题是什么？你如何解决？",
  ],
  note: "有 GitHub、演示网站或项目截图，可以附上链接。私人项目不要求公开源码。建议 200–400 字。",
} as const;

export const VIDEO_TASK_QUESTION = {
  title: "第二题：实现一个 AI 视频任务功能",
  scenario:
    "假设你正在开发一个 AI 视频生成系统。用户提交一个视频素材 ID 和一段提示词，系统调用 AI 视频接口创建任务。由于视频生成需要时间，系统需要不断查询任务状态，直到视频生成成功或失败。",
  apiIntro: "已经提供两个 API 函数（无需实现）：",
  apis: [
    {
      signature: "createVideoTask(assetId, prompt)",
      description: "创建任务，返回 Promise<{ taskId: string }>。",
    },
    {
      signature: "getVideoTask(taskId)",
      description:
        "查询任务，返回 Promise，结果包含 status（queued、running、succeeded、failed 四种状态）、videoUrl（成功时返回的视频地址）、error（失败时返回的错误信息）。",
    },
  ],
  taskIntro:
    "请使用 JavaScript 或 TypeScript 实现函数 generateVideo(assetId, prompt)，要求：",
  requirements: [
    "创建视频生成任务，获取任务 ID。",
    "每隔约 1 秒查询一次任务状态。",
    "成功时返回视频 URL。",
    "失败时抛出有用的错误信息。",
    "最长等待 30 秒，超时后停止查询。",
    "处理接口异常，避免程序无限等待。",
  ],
  note: "不需要真实 AI API Key，不需要搭建页面，也不需要真正生成视频。",
  mockIntro:
    "下面是一份模拟接口，行为接近真实服务（延迟不固定，偶尔出错）。可以复制到本地，用来自测你的实现：",
} as const;

export const VIDEO_TASK_MOCK_SOURCE = `// 模拟接口：延迟不固定，偶尔出错，行为接近真实服务
const tasks = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createVideoTask(assetId, prompt) {
  await sleep(200 + Math.random() * 300);
  if (Math.random() < 0.1) throw new Error('create failed: upstream 503');
  const taskId = \`task_\${Date.now()}\`;
  tasks.set(taskId, {
    createdAt: Date.now(),
    finishInMs: 3000 + Math.random() * 6000,
    willFail: Math.random() < 0.2,
  });
  return { taskId };
}

async function getVideoTask(taskId) {
  if (Math.random() < 0.05) return new Promise(() => {});
  await sleep(100 + Math.random() * 400);
  if (Math.random() < 0.1) throw new Error('network error');
  const task = tasks.get(taskId);
  if (!task) throw new Error(\`task not found: \${taskId}\`);
  const elapsed = Date.now() - task.createdAt;
  if (elapsed < 1000) return { status: 'queued' };
  if (elapsed < task.finishInMs) return { status: 'running' };
  return task.willFail
    ? { status: 'failed', error: 'content moderation rejected' }
    : { status: 'succeeded', videoUrl: \`https://cdn.example.com/\${taskId}.mp4\` };
}
`;

export const REMIX_QUESTION = {
  title: "第三题：AI 视频裂变方案",
  scenario:
    "假设公司有 20 条现成的产品视频素材，希望利用 AI 自动生成 5 条不同创意的千川广告视频（千川即巨量千川，抖音电商的广告投放平台）。如果由你开发这个功能，你会如何实现？",
  prompts: [
    "从现有视频素材到生成新视频，需要经过哪些主要步骤？",
    "哪些环节适合交给大模型，哪些环节适合使用普通程序或视频处理工具？",
    "如何避免 AI 选错素材、5 条内容几乎相同？你会如何判断生成的视频合格？",
  ],
  note: "建议 200–300 字，无需代码。",
} as const;

export const CLOSING_NOTE =
  "我们更看重你真实的思考过程、代码质量、解决问题的能力，以及利用 AI 工具完成实际开发的能力。你可以使用 AI 辅助答题，但应能解释提交的代码和自己的设计选择。";

export const PRIVACY_NOTE =
  "你填写的个人信息只用于本次招聘沟通，不会对外公开。";
