import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  DOUYIN_BRAND_STRATEGY_CARD,
  DOUYIN_BRAND_STRATEGY_PAGE,
  DOUYIN_BRAND_STRATEGY_PATH,
} from './analysis-plans/douyin-brand-strategy';
import {
  DOUYIN_LIVE_RECORDING_AI_ANALYSIS_CARD,
  DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PAGE,
  DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PATH,
} from './analysis-plans/douyin-live-recording-ai-analysis';
import {
  DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_CARD,
  DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PAGE,
  DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PATH,
} from './analysis-plans/douyin-qianchuan-live-traffic-shortvideo-ai-analysis';
import {
  DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_CARD,
  DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PAGE,
  DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PATH,
} from './analysis-plans/douyin-qianchuan-product-shortvideo-ai-analysis';
import {
  DOUYIN_INDUSTRY_SELLING_POINTS_CARD,
  DOUYIN_INDUSTRY_SELLING_POINTS_PAGE,
  DOUYIN_INDUSTRY_SELLING_POINTS_PATH,
} from './analysis-plans/douyin-industry-selling-points';
import type { DocsCard, DocsPageKey, DocsPageLink, DocsPageModel, DocsTable } from './docs-workspace-contracts';

export type {
  DocsCard,
  DocsPageKey,
  DocsPageLink,
  DocsPageModel,
  DocsRow,
  DocsSection,
  DocsStep,
  DocsTable,
  DocsWorkspaceSnapshot,
  NavItem,
} from './docs-workspace-contracts';

export const DOCS_PAGE_LINKS: DocsPageLink[] = [
  { key: 'home', href: ROUTE_PATHS.docs, label: '文档中心', helper: '产品、方法和资料入口' },
  { key: 'guide', href: ROUTE_PATHS.docsGuide, label: '使用指南', helper: '按功能完成上手' },
  { key: 'analysis-frameworks', href: ROUTE_PATHS.docsAnalysisFrameworks, label: '分析框架', helper: '稳定诊断方法论' },
  { key: 'analysis-plans', href: ROUTE_PATHS.docsAnalysisPlans, label: '分析方案', helper: '场景化执行路径' },
  { key: 'references', href: ROUTE_PATHS.docsReferences, label: '参考资料', helper: '源文档与口径依据' },
];

export const VALUE_ROWS = [
  { label: '先用产品', value: '新成员先看使用指南，明确看板、周报、月报和 DataOps 的入口与顺序。' },
  { label: '再用方法', value: '分析人员再看分析框架，把商品、渠道、漏斗、因子和评分口径统一起来。' },
  { label: '最后落动作', value: '业务复盘时进入分析方案，把异常定位、汇报产出和动作 SLA 串成闭环。' },
  { label: '需要追溯', value: '口径或方法被质疑时，进入参考资料查看源文档、边界和历史依据。' },
];

export const DOCS_HOME_CARDS: DocsCard[] = [
  {
    title: '使用指南',
    desc: '从“怎么打开、怎么看、先看哪里”开始，覆盖看板、周报、月报、AI 总结和 DataOps 排障。',
    href: ROUTE_PATHS.docsGuide,
    action: '进入指南',
    meta: '上手入口',
  },
  {
    title: '分析框架',
    desc: '沉淀天猫、抖音、商品评分和统一归因方法，解决“用什么口径分析”的问题。',
    href: ROUTE_PATHS.docsAnalysisFrameworks,
    action: '查看框架',
    meta: '方法资产',
  },
  {
    title: '分析方案',
    desc: '把框架变成场景化流程，覆盖周报归因、月报复盘、专题报告和异常排查。',
    href: ROUTE_PATHS.docsAnalysisPlans,
    action: '查看方案',
    meta: '执行路径',
  },
  {
    title: '参考资料',
    desc: '保留源文件、公开/内部参考和方法边界，便于复核、审阅和继续迭代。',
    href: ROUTE_PATHS.docsReferences,
    action: '打开资料',
    meta: '证据来源',
  },
];

const QIANCHUAN_CONTENT_ASSET_PLAN_SELECTION_TABLE: DocsTable = {
  title: '千川素材中台两类方案选型',
  headers: ['方案', '目标 / objective', '必须合并的数据', '不能越界的结论'],
  rows: [
    [
      '千川挂车带货短视频 AI 分析',
      'product_all_domain_shortvideo；判断短视频是否推动商品卡点击和成交。',
      'ads.marketing_content_assets + ads.marketing_content_ad_materials.external_material_id -> material_id + dws.marketing_content_qianchuan_material_summary + ods.douyin_qianchuan_shortvideo_raw；商品卡承接另取 ods.douyin_trade_sale_card_detail_raw，不是 material_id 直连，需取得 product_id 后按日期窗口 / source_level1 分级关联。',
      '不能只看视频内容就给放量/暂停；ROI 达标也要同时看净成交、结算和退款风险；商品卡明细只能做商品/日期/来源承接上下文，不能默认代表单 material_id 精确成交归因。',
    ],
    [
      '千川直播短视频引流 AI 分析',
      'live_all_domain_shortvideo；判断短视频是否把正确人群带进直播间。',
      'ads.marketing_content_assets + ads.marketing_content_ad_materials.external_material_id -> material_id + dws.marketing_content_qianchuan_material_summary + ods.douyin_qianchuan_live_video_raw + dws.marketing_content_qianchuan_live_room_acceptance_di + ods.douyin_trade_sale_live_raw；必要时用 ads.douyin_live_detail 复核场次。',
      '直播间成交数据不代表单个 material_id 精确成交归因；只能作为直播间承接环境，除非另有可验证的场次级对齐证据；不要用商品卡明细替代直播间承接。',
    ],
  ],
};

export const DOCS_PAGES: Record<DocsPageKey, DocsPageModel> = {
  home: {
    key: 'home',
    path: ROUTE_PATHS.docs,
    eyebrow: 'Docs Center',
    title: 'AIOS 文档中心',
    subtitle: '把产品使用、分析方法、执行方案和参考依据分开沉淀，避免帮助文档变成一页混杂的长清单。',
    primaryAction: {
      href: ROUTE_PATHS.docsGuide,
      label: '从使用指南开始',
    },
    sections: [
      {
        id: 'docs-sections',
        title: '按任务分区',
        lead: '先判断你是在学习产品、搭建分析口径、执行复盘，还是追溯资料来源。',
        cards: DOCS_HOME_CARDS,
      },
      {
        id: 'recommended-path',
        title: '推荐阅读顺序',
        lead: '文档中心默认服务内部经营分析，不追求营销式介绍，优先保证任务路径清楚。',
        rows: VALUE_ROWS,
      },
    ],
  },
  guide: {
    key: 'guide',
    path: ROUTE_PATHS.docsGuide,
    eyebrow: 'User Guide',
    title: '使用指南',
    subtitle: '回答“AIOS 怎么用”：从看板发现问题，到周报归因、月报复盘、AI 摘要和 DataOps 排障。',
    primaryAction: {
      href: ROUTE_PATHS.dashboard,
      label: '打开看板',
    },
    sections: [
      {
        id: 'guide-quick-start',
        title: '快速开始',
        lead: '新成员优先按入口上手，不需要先阅读完整方法论。',
        cards: [
          { title: '看板监控', desc: '先看核心 KPI 和平台趋势，识别异常波动。', href: ROUTE_PATHS.dashboard, action: '打开看板' },
          { title: '周报归因', desc: '按“商品 → 渠道 → 因子”定位周度涨跌原因。', href: ROUTE_PATHS.reportsWeekly, action: '进入周报' },
          { title: '月报复盘', desc: '观察趋势稳定性、平台结构变化和策略延续性。', href: ROUTE_PATHS.reportsMonthly, action: '进入月报' },
          { title: '运维排障', desc: '检查 ETL 链路、目标表水位和通知链路状态。', href: ROUTE_PATHS.opsDataops, action: '进入运维' },
        ],
      },
      {
        id: 'guide-dashboard',
        title: '看板怎么读',
        paragraphs: [
          '看板用于实时浏览核心经营指标，适合“先看全局、再下钻”的日常管理动作。',
          '建议先看 GMV、退款、访客、转化等主指标，再进入商品、平台或达人等专项页面确认异常来自哪里。',
        ],
      },
      {
        id: 'guide-weekly',
        title: '周报阅读顺序',
        lead: '周报适合复盘一周内的经营变化，阅读顺序应从结论进入证据，而不是先翻表格。',
        steps: [
          { title: '先看 GMV 波动归因', desc: '确认本周涨跌来自哪个平台、商品或主要经营变量。' },
          { title: '再看商品与渠道定位', desc: '锁定贡献或拖累最大的商品，再看该商品在哪些渠道发生变化。' },
          { title: '最后看漏斗和量化归因', desc: '用流量、转化、客单、费用和 ROI 等因子解释渠道变化。' },
        ],
      },
      {
        id: 'guide-monthly',
        title: '月报使用建议',
        paragraphs: [
          '月报用于月度复盘与策略回顾，重点关注趋势稳定性、平台结构变化和策略延续性。',
          '不要把月报当成周报的放大版；月报应更关注结构性变化和下月动作优先级。',
        ],
      },
      {
        id: 'guide-ai-summary',
        title: 'AI 总结使用建议',
        paragraphs: [
          'AI 总结用于提炼结论，不替代指标核对。建议先完成业务口径确认再触发 AI 生成。',
          '出现异常结论时，回到看板、漏斗与量化归因复核，不直接把 AI 输出写成最终判断。',
        ],
      },
      {
        id: 'guide-dataops',
        title: 'DataOps 排障顺序',
        steps: [
          { title: '先看 ADS 目标表', desc: '确认报告或看板读取的目标表是否已经刷新。' },
          { title: '再看 DWD / ODS 水位', desc: '如果 ADS 未更新，继续检查上游源表时间戳和行数。' },
          { title: '最后看失败节点', desc: '按 DataOps 面板里的失败节点、运行 ID 和通知链路逐层回溯。' },
        ],
      },
    ],
  },
  'analysis-frameworks': {
    key: 'analysis-frameworks',
    path: ROUTE_PATHS.docsAnalysisFrameworks,
    eyebrow: 'Analysis Frameworks',
    title: '分析框架',
    subtitle: '回答“应该按什么口径分析”：把商品、渠道、漏斗、因子、评分和平台差异拆成稳定方法。',
    sections: [
      {
        id: 'framework-overview',
        title: '框架总览',
        lead: '框架是长期稳定的方法论，不等同于一次复盘方案。',
        rows: [
          { label: '天猫商品诊断', value: '商品 → 渠道 → 漏斗/因子，适合解释单品 GMV 波动。' },
          { label: '抖音渠道诊断', value: '直播 / 短视频 / 商品卡分别拆解，避免用同一套漏斗解释不同渠道。' },
          { label: '商品综合评分', value: '用 TOPSIS 混合评分把成交、效率、稳定性和置信度纳入同一选择口径。' },
          { label: '统一归因框架', value: '从指标变化进入可执行动作，保留 SLA、优先级和证据边界。' },
        ],
      },
      {
        id: 'framework-tmall-channel',
        title: '天猫商品诊断框架',
        lead: '默认按“商品 → 渠道 → 因子”推进，先锁定商品，再解释渠道变化。',
        steps: [
          { title: '定位商品', desc: '在商品定位表和瀑布图中，先锁定 GMV 变化最显著的核心商品。' },
          { title: '定位渠道', desc: '在渠道瀑布中识别拉动/拖累渠道，重点关注增量贡献明显的渠道。' },
          { title: '看流量漏斗', desc: '把访客、点击、收藏加购、支付转化和推广指标拆开，判断是流量问题还是转化问题。' },
          { title: '看量化归因', desc: '按渠道类型动态切换公式，显式考虑因子交互影响。' },
        ],
      },
      {
        id: 'framework-tmall-scoring',
        title: '天猫商品 10 分制综合评分',
        paragraphs: [
          '评分框架用于商品候选池排序，不替代人工判断。它把成交、增长、效率、退款、样本置信度等指标压缩到统一分值。',
          '当样本不足或数据缺失时，应降低置信度或标记为不可比较，不能把缺失值画成真实 0。',
        ],
      },
      {
        id: 'framework-douyin-channel',
        title: '抖音渠道诊断框架',
        lead: '抖音不要只看总 GMV，需要按直播、短视频、商品卡分别解释。',
        cards: [
          { title: '直播', desc: '关注场次、达人/自播结构、场观、转化和货品匹配。' },
          { title: '短视频', desc: '关注内容曝光、点击、商品承接和素材生命周期。' },
          { title: '商品卡', desc: '关注搜索/推荐入口、商品承接效率和流量来源结构。' },
          {
            title: '品牌策略打法拆解',
            desc: '把抖音品牌拆解从渠道诊断扩展到生意节奏、货盘、内容、人群、投放、直播和竞品对照。',
            href: DOUYIN_BRAND_STRATEGY_PATH,
            action: '进入方案',
          },
        ],
      },
      {
        id: 'framework-attribution',
        title: '统一归因框架',
        paragraphs: [
          '统一归因框架要求每个结论都有指标、时期、对象、计算边界和动作建议。',
          '如果证据不足，应明确写“待核查/待补证据”，不要把猜测升级成经营结论。',
        ],
      },
    ],
  },
  'analysis-plans': {
    key: 'analysis-plans',
    path: ROUTE_PATHS.docsAnalysisPlans,
    eyebrow: 'Analysis Plans',
    title: '分析方案库',
    subtitle: '回答“这次复盘怎么做”：把稳定框架落到具体场景、输入数据、输出物和动作路径；每套成熟方案进入独立详情页。',
    sections: [
      {
        id: 'plans-overview',
        title: '方案库怎么用',
        paragraphs: [
          '分析框架回答“用什么口径分析”，分析方案回答“这次任务具体怎么做”。',
          '列表页只负责查找、对比和进入详情；完整步骤、数据清单和表格沉淀到独立方案页，避免帮助文档变成不可维护的长页面。',
        ],
        rows: [
          { label: '适用对象', value: '品牌复盘、竞品对标、周报归因、月报复盘、异常排查和专题报告。' },
          { label: '页面边界', value: '方案库展示卡片、适用场景和维护规范；独立页承载完整方法、表格和操作清单。' },
          { label: '新增方式', value: '每新增一套成熟方案，就在方案库加卡片，并创建对应的独立详情页。' },
        ],
      },
      {
        id: 'qianchuan-content-asset-plan-selection',
        title: '千川素材中台方案选型',
        lead: '先按 objective 选方案，再核对素材数据库、material_id 和承接数据。挂车成交和直播引流不能共用同一套判断逻辑；两者都从素材数据库出发，但成交承接和归因边界不同。',
        tables: [QIANCHUAN_CONTENT_ASSET_PLAN_SELECTION_TABLE],
      },
      {
        id: 'plan-library',
        title: '已上线方案',
        lead: '选择具体场景进入独立方案页。后续新增方案也按这个结构沉淀。',
        cards: [
          DOUYIN_BRAND_STRATEGY_CARD,
          DOUYIN_INDUSTRY_SELLING_POINTS_CARD,
          DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_CARD,
          DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_CARD,
          DOUYIN_LIVE_RECORDING_AI_ANALYSIS_CARD,
        ],
      },
      {
        id: 'plan-pipeline',
        title: '待拆分方案',
        lead: '这些方向先保留为方案位。等内容稳定后，再从卡片升级为独立详情页。',
        cards: [
          {
            title: '周报归因拆解方案',
            desc: '适用于解释周度波动，把贡献、拖累、因子解释和动作 SLA 串成闭环。',
            meta: '待补独立页',
            tags: ['周报', '归因', '经营动作'],
          },
          {
            title: '月报复盘方案',
            desc: '适用于月度经营复盘，重点看趋势稳定性、平台结构和下月动作优先级。',
            meta: '待补独立页',
            tags: ['月报', '复盘', '结构变化'],
          },
          {
            title: '专题报告产出方案',
            desc: '适用于把单一经营问题组织成 answer-first 报告，明确主视觉证据、结论和行动建议。',
            meta: '待补独立页',
            tags: ['专题报告', '图表证据', '结论优先'],
          },
          {
            title: '异常排查方案',
            desc: '适用于先排数据新鲜度，再定位业务对象，最后输出可执行动作。',
            meta: '待补独立页',
            tags: ['异常', '排障', 'SLA'],
          },
        ],
      },
      {
        id: 'plan-maintenance',
        title: '新增方案规范',
        paragraphs: [
          '新方案先判断是否已经稳定到可以复用：如果只是一次临时分析，不应立即进入方案库。',
          '独立方案页至少包含适用场景、输入数据、执行步骤、判断模型、输出物和动作清单。标题不使用内部编号或版本号，版本信息可以留在后台变更记录中。',
          '方案库卡片只写读者需要选择的信息：场景、输入、输出、标签和进入详情的动作。',
        ],
      },
    ],
  },
  references: {
    key: 'references',
    path: ROUTE_PATHS.docsReferences,
    eyebrow: 'References',
    title: '参考资料',
    subtitle: '集中保留方法源文档、计算口径和执行手册。这里是依据层，不是日常阅读入口。',
    sections: [
      {
        id: 'reference-documents',
        title: '参考文档清单',
        lead: '这些资料用于复核框架来源、计算边界和行动建议，不直接替代当前页面的阅读路径。',
        cards: [
          {
            title: '天猫商品诊断框架（商品→渠道→因子）',
            desc: '覆盖搜索、推荐、关键词推广、人群推广的原因库与动作库。',
            href: '#reference-tmall',
            action: '查看说明',
            meta: 'docs/tmall_channel_diagnosis_v2.md',
          },
          {
            title: '天猫商品 10 分制综合评分（TOPSIS 混合版）',
            desc: '覆盖候选池、指标权重、TOPSIS 计算、样本置信度与可视化约定。',
            href: '#reference-tmall-scoring',
            action: '查看说明',
            meta: 'docs/tmall_goods_topsis_scoring_v1.md',
          },
          {
            title: '抖音渠道诊断框架（直播/短视频/商品卡）',
            desc: '覆盖三大渠道及关键漏斗因子的归因与执行动作。',
            href: '#reference-douyin',
            action: '查看说明',
            meta: 'docs/douyin_channel_diagnosis_correct.md',
          },
          {
            title: '周报归因拆解与执行动作手册',
            desc: '包含统一归因框架、动作 SLA、外部证据与方法边界。',
            href: '#reference-action-guide',
            action: '查看说明',
            meta: 'docs/REPORTS_CHANNEL_ATTRIBUTION_ACTION_GUIDE_2026-03-04.md',
          },
        ],
      },
      {
        id: 'reference-usage',
        title: '资料使用边界',
        paragraphs: [
          '参考资料用于复核口径和方法，不应直接复制成长篇页面正文。',
          '如果页面结论和源文档冲突，优先回到当前运行态数据、报告口径和最新实现核查。',
        ],
      },
      {
        id: 'reference-tmall',
        title: '天猫诊断框架说明',
        paragraphs: [
          '适用于解释天猫商品 GMV 波动，重点看商品、渠道和因子之间的链路。',
        ],
      },
      {
        id: 'reference-tmall-scoring',
        title: 'TOPSIS 评分说明',
        paragraphs: [
          '适用于商品候选池排序和经营优先级判断。样本不足时必须显示置信度边界。',
        ],
      },
      {
        id: 'reference-douyin',
        title: '抖音诊断框架说明',
        paragraphs: [
          '适用于直播、短视频、商品卡分渠道诊断，避免把不同流量机制混成一个解释模型。',
        ],
      },
      {
        id: 'reference-action-guide',
        title: '归因动作手册说明',
        paragraphs: [
          '适用于把经营归因转成可执行动作，尤其是 owner、SLA、预期指标和复核节奏。',
        ],
      },
    ],
  },
};

export const DOCS_DETAIL_PAGES: Record<string, DocsPageModel> = {
  [DOUYIN_BRAND_STRATEGY_PATH]: DOUYIN_BRAND_STRATEGY_PAGE,
  [DOUYIN_INDUSTRY_SELLING_POINTS_PATH]: DOUYIN_INDUSTRY_SELLING_POINTS_PAGE,
  [DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PATH]: DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PAGE,
  [DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PATH]: DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PAGE,
  [DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PATH]: DOUYIN_LIVE_RECORDING_AI_ANALYSIS_PAGE,
};
