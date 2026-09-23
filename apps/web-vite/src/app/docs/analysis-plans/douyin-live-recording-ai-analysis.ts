import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { DocsCard, DocsPageModel } from '../docs-workspace-data';

export const DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PATH = `${ROUTE_PATHS.docsAnalysisPlans}/douyin-live-recording-ai-analysis`;

export const DOUYIN_LIVE_RECORDING_AI_ANALYSIS_CARD: DocsCard = {
  title: '抖音直播录屏 AI 分析 V4',
  desc: '直播录屏、分钟成交、ASR 话术、关键帧和人工复核闭环的资深运营复盘方案。',
  href: DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PATH,
  action: '进入方案',
  meta: '抖音 / 直播录屏 / AI 分析 V4',
  tags: ['抖音直播', '证据链', '多模态'],
  details: [
    { label: '定位', value: 'Transcript-first / Evidence-driven / Multimodal-on-demand。' },
    { label: '输入', value: '录屏、ASR/OCR、弹幕、商品卡、分钟成交与 ROI。' },
    { label: '输出', value: '经营结论、时间复盘、话术点评、六维 Scorecard、行动清单、evidence_ids 与复核任务。' },
  ],
};

export const DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PAGE: DocsPageModel = {
  key: 'analysis-plans',
  path: DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PATH,
  eyebrow: 'Analysis Plan',
  title: '抖音直播录屏 AI 分析 V4',
  subtitle: '用文本优先、证据驱动、按需多模态的方式，把直播录屏、分钟成交、商品卡、弹幕和人工复核沉淀成可追溯复盘能力。',
  primaryAction: {
    href: ROUTE_PATHS.docsAnalysisPlans,
    label: '返回方案库',
  },
  sections: [
    {
      id: 'plan-positioning',
      title: '方案定位',
      paragraphs: [
        'V4 不先做昂贵的全量视频理解，而是把录屏拆成可检索、可复核、可评估的证据链；video-use 仅作工程参考，不作运行时依赖。',
      ],
      rows: [
        { label: 'Transcript-first', value: '先产出 transcript、事件切片和分钟指标，用文本模型完成第一轮归因。' },
        { label: 'Evidence-driven', value: '正式结论必须挂 evidence_ids，可回放原话、画面、商品卡、弹幕或成交拐点。' },
        { label: 'Multimodal-on-demand', value: '价格、画面或商品一致性会改变判断时，才升级 OCR、关键帧或多模态 L2。' },
        { label: 'Human review loop', value: '高价值、低置信、证据冲突和合规风险片段进入人工复核并回写评估集。' },
        { label: 'Operator-review', value: '主路径按资深直播运营复盘输出：先判断转化瓶颈，再落到话术、商品、福利、CTA、互动和画面。' },
        { label: 'Coverage-aware', value: '采样 ASR、少量画面和缺失商品卡/OCR/弹幕必须限制结论口径，不能把片段证据写成全场绝对判断。' },
        { label: 'Quality gate', value: '模型产物归一化后由 worker 确定性生成复盘质量门，判断可定稿、需复核或暂不建议定稿。' },
      ],
    },
    {
      id: 'plan-architecture',
      title: '总体架构',
      lead: '所有输入先对齐同一 live clock，再打包、分析、自评和复核。',
      steps: [
        { title: '1. 对齐时间轴', desc: '录屏、ASR、OCR、弹幕、商品卡和分钟成交统一到直播时钟。' },
        { title: '2. 生成事件切片', desc: '按商品切换、弹幕密度、成交峰值、ROI 下滑和 OCR 关键状态切 segment，即 event slicing。' },
        { title: '3. 打包 live_packed.md', desc: '按 segment 汇总 transcript、弹幕、OCR、商品卡、指标、evidence_ids 和待补线索。' },
        { title: '4. L1 / L2 路由', desc: '文本足够走 L1；价格/画面/商品冲突会改变结论时走多模态 L2。' },
        { title: '5. self-eval', desc: 'analysis_self_eval 决定是否进报告、升级多模态或派发人工复核。' },
        { title: '6. recovery / rerun', desc: 'worker 中断后可复用 input_snapshot.derivedInputs 做 text-only recovery；如需完整画面结论，重新发起 L2 或 rerun。' },
      ],
    },
    {
      id: 'plan-contract',
      title: '证据链与产物',
      lead: '成交解释必须同时看话术、商品卡承接、价格一致性、弹幕问题和成交是否跟随。',
      tables: [
        {
          title: '产物与质量合同',
          headers: ['模块', '必须保留', '验收口径'],
          rows: [
            ['evidence_ids', 'asr / frame / comment / product_card / metric / review。', '缺证据只进待复核区，不进正式经营结论。'],
            ['ROI / OCR 识别', 'product-card / comment / price 视角下的商品卡切换、口播价、屏幕价、券后价、弹幕疑问、成交峰值和消耗变化。', '解释承接强弱、价格冲突、福利拉动、用户阻力和 ROI 下滑。'],
            ['核心产物', 'executive_review.json、moment_reviews.json、script_review.json、operator_scorecard.json、conversion_diagnosis.json、action_plan.json、analysis_edl.json、analysis_self_eval.json、review_tasks.json。', '结论、时间片段、原话点评、六维评分、动作清单和模型重跑读取同一证据引用。'],
            ['话术点评合同', 'scriptReview 每条必须包含 timeAnchor、quote、intent、operatorComment、rewriteSuggestion、riskFlags、evidenceIds。', 'quote 只能来自 ASR；无 ASR 时进入 reviewTasks，不编造主播原话。'],
            ['六维运营合同', 'operatorScorecard 固定输出 话术 / 商品 / 福利 / CTA / 互动 / 画面 六项。', '每项必须给 score、status、diagnosis、fix 和 evidenceIds；处理覆盖度不进复盘页面，只留 raw/inputSnapshot 排查。'],
            ['行动合同', 'actionPlan 只保留 3-5 条互不重复动作，必须有 priority、ownerRole、due、action、reason、expectedImpact、evidenceIds。', '动作要能交给主播、场控、运营或复盘执行，不能写泛泛“优化节奏”。'],
            ['证据闭合合同', '所有 evidenceIds 必须能在 evidenceLedger 中找到同名证据；缺失证据只能进入 reviewTasks 或 review 类型 evidence。', '禁止出现 frame:all、asr:*、metric:* 等悬空引用；结果页才能稳定回放定位。'],
            ['覆盖率合同', 'analysisSelfEval 必须包含 claimScope、evidenceCoverage、missingEvidence、riskFlags、requiresHumanReview、needsMultimodal。', '采样 ASR 只能写“采样口播显示”；少量画面不能写成全场商品卡/贴片结论。'],
            ['质量门合同', 'analysisQualityGate 由 worker 后处理生成，包含 score、grade、safeToUseAsFinalReview、blockingIssues、warnings、evidenceHealth。', '不是模型自评；用于在结果页展示复盘质量、证据健康和定稿前复核提醒。'],
            ['影响合同', 'expectedImpact 写改善方向和下一场观察指标。', '没有 baseline 或实验数据时，不编造 20% / 30% / 60% 这类具体百分比。'],
          ],
        },
      ],
    },
    {
      id: 'plan-human-review',
      title: '评估、复核与路线',
      lead: '人工复核不覆盖所有片段，只处理高价值和高风险片段，并把结果回写评估集。',
      rows: [
        { label: '复核对象', value: '高 GMV、高消耗、低 ROI、低置信、证据冲突和合规风险片段。' },
        { label: '复核动作', value: '确认商品、价格、话术标签、用户疑问、成交解释和最终可采纳结论。' },
        { label: '评估集', value: 'evaluation set 覆盖成交峰值、ROI 异常、价格福利、弹幕疑问和人工争议样本。' },
        { label: '闭环指标', value: '证据召回率、结论采纳率、复核通过率、低置信占比、报告改写率和人工耗时。' },
        { label: '采样计划', value: 'inputSnapshot.samplingPlan 记录开场、首单、成交峰值、长空窗和收尾窗口，说明每个片段为何被分析。' },
        { label: 'L1/L2 关系', value: 'L1 文本复盘先产出，不被 L2 视频/OCR 阻塞；L2 只补会改变结论的关键窗口，失败时进入 self-eval 与 reviewTasks。' },
        { label: '恢复与重跑', value: 'running job 卡住且已有 derivedInputs 时可 text-only recovery；要补完整画面/商品卡结论时使用重新分析或 L2 enrichment。' },
      ],
      tables: [
        {
          title: 'P0-P3 路线',
          headers: ['阶段', '目标', '不做什么'],
          rows: [
            ['P0', '字段草案、样例 live_packed.md、人工复核表。', '不接生产队列。'],
            ['P1', '3-5 场直播跑 L1 文本分析和人工复核。', '不追求全自动。'],
            ['P2', '补 OCR/关键帧、商品卡一致性、价格冲突和 L2 路由。', '不把所有片段送强模型。'],
            ['P3', '接入 live_timeline_view、review_tasks、评估集和报告输出。', '不跳过 QA/self-eval。'],
          ],
        },
      ],
    },
  ],
};
