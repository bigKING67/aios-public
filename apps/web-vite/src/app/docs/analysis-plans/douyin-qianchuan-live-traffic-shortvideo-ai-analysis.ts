import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { DocsCard, DocsPageModel, DocsRow, DocsStep, DocsTable } from '../docs-workspace-data';

export const DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PATH = `${ROUTE_PATHS.docsAnalysisPlans}/douyin-qianchuan-live-traffic-shortvideo-ai-analysis`;

export const DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_CARD: DocsCard = {
  title: '千川直播短视频引流 AI 分析',
  desc: '面向直播间引流素材，结合素材本体、千川引流表现和直播间承接环境，区分素材钩子问题和直播间承接问题。',
  href: DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PATH,
  action: '进入方案',
  meta: '千川 / 直播引流 / 承接边界',
  tags: ['千川', '直播引流', '承接诊断'],
  details: [
    { label: '定位', value: 'objective=live_all_domain_shortvideo，先判断素材是否带来正确进房意图。' },
    { label: '素材库', value: 'ads.marketing_content_assets + ads.marketing_content_ad_materials，先确认 asset_id 与直播引流 material_id。' },
    { label: '直播数据', value: 'dws 直播引流快照 + 直播间承接环境；成交数据只作承接背景，不作 material_id 精确归因。' },
    { label: '输出', value: '引流质量、直播承接归因边界、素材/直播间动作和复核清单。' },
  ],
};

const LIVE_DATA_SOURCE_TABLE: DocsTable = {
  title: '素材数据库、千川引流与直播间承接源',
  headers: ['层级', '表 / 对象', '用途', '关键字段或边界'],
  rows: [
    [
      '素材本体库',
      'ads.marketing_content_assets',
      '确认被分析的原始素材、预览、封面、transcript、标题、标签、档案和 AI 摘要。',
      '以 asset_id 标识素材本身；直播引流判断仍要先说明素材来自这个素材数据库。',
    ],
    [
      '广告素材实例绑定库',
      'ads.marketing_content_ad_materials',
      '把素材本体绑定到千川直播引流素材实例。',
      'external_material_id 对应千川 material_id；同一 asset_id 可能有多个投放实例。',
    ],
    [
      'AI / 页面可用汇总层',
      'dws.marketing_content_qianchuan_material_summary',
      '给详情页和 AI 分析读取千川直播引流素材表现快照。',
      '保留 objective、source_table、消耗、曝光、点击、进房、商品点击、成交和样本门槛信息。',
    ],
    [
      '直播引流型 ODS 源',
      'ods.douyin_qianchuan_live_video_raw',
      '直播全域 / 直播间引流型短视频素材表现源。',
      'objective=live_all_domain_shortvideo；用于判断素材带来的进房意图和直播引流效率。',
    ],
    [
      '直播间承接汇总',
      'dws.marketing_content_qianchuan_live_room_acceptance_di',
      '给 AI 提供直播间承接环境，如商品点击、成交、退款、ROI 或承接质量。',
      '用于解释素材流量进入直播间后是否被接住，但不是 material_id 级精确成交归因。',
    ],
    [
      '账号/日期级直播成交源',
      'ods.douyin_trade_sale_live_raw',
      '提供账号 + 日期级直播间成交和承接环境。',
      '只能作为承接环境，不代表单个 material_id 的精确成交贡献。',
    ],
    [
      '场次复核 / 上下文',
      'ads.douyin_live_detail',
      '必要时用于核对直播场次、主播、直播时间、账号和场次侧上下文。',
      '可作为复核依据，不能写成单素材精确归因表。',
    ],
  ],
};

const LIVE_DISPLAY_CONTRACT_TABLE: DocsTable = {
  title: '页面展示合同',
  headers: ['展示区块', '必须标明', '用途'],
  rows: [
    [
      '素材身份',
      '素材数据库=ads.marketing_content_assets、asset_id、标题/封面/transcript/素材档案。',
      '先确认被分析的是哪条素材，而不是一段脱离素材库的视频。',
    ],
    [
      '千川实例',
      '绑定库=ads.marketing_content_ad_materials、material_id、objective=live_all_domain_shortvideo。',
      '说明当前素材实例属于直播引流目标，不能套用挂车成交口径。',
    ],
    [
      '引流表现',
      '汇总层=dws.marketing_content_qianchuan_material_summary、source_table=ods.douyin_qianchuan_live_video_raw、first_stat_date、last_stat_date、updated_at。',
      '证明素材侧的曝光、点击、进房、消耗和样本状态来自哪张表。',
    ],
    [
      '直播承接',
      'dws.marketing_content_qianchuan_live_room_acceptance_di、ods.douyin_trade_sale_live_raw、updated_at、必要时 ads.douyin_live_detail。',
      '解释进房后直播间是否接住流量，同时展示承接数据不是单 material_id 精确归因。',
    ],
    [
      '归因提示',
      'live_acceptance_attribution、confidence、alignment_level、data_quality_status、sample_quality_status、缺失字段提示。',
      '把“素材问题”和“直播间承接问题”拆开，避免 AI 越权归因。',
    ],
  ],
};

const LIVE_EXECUTION_SUMMARY_ROWS: DocsRow[] = [
  { label: '什么时候用', value: '素材目标是千川直播引流短视频，当前要判断 material_id 是否带来正确进房意图，以及直播间是否接住。' },
  { label: '先验四件事', value: '先确认 asset_id、active 千川 material_id、live_all_domain_shortvideo 引流快照、直播间承接环境；缺承接时只能做素材引流侧诊断。' },
  { label: '核心读法', value: '先看视频钩子和进房理由，再看曝光/点击/消耗/进房效率，最后用直播间商品点击、UV value、GPM、退款和场次上下文解释承接。' },
  { label: '第一优先动作', value: '先判 alignment_level 与 live_acceptance_attribution；只有素材引流和直播承接都稳定，才允许小步 scale_or_keep_traffic。' },
  { label: '当前状态', value: '本页是 docs-level analysis plan / contract；本任务不改 AI runtime、后端 API、数据库 schema 或 job 队列，后续 runtime 接入需另起实现任务。' },
];

const LIVE_CONTEXT_PACK_TABLE: DocsTable = {
  title: 'AI 输入包',
  headers: ['输入包', '来源', '关键字段', '缺失时处理'],
  rows: [
    [
      'asset_profile',
      'ads.marketing_content_assets',
      'asset_id、标题、封面、预览、transcript、标签、直播利益点/人群/场景档案、已有 AI 摘要。',
      '缺素材档案时只能判断内容钩子与直播指向；不得输出进房效率或承接结论。',
    ],
    [
      'material_identity',
      'ads.marketing_content_ad_materials',
      'external_material_id、material_id、objective=live_all_domain_shortvideo、delivery_mode、account、active 绑定状态。',
      '多 material_id 未选择时停止正式诊断，要求按实例分别复盘。',
    ],
    [
      'traffic_snapshot',
      'dws.marketing_content_qianchuan_material_summary',
      'first_stat_date、last_stat_date、source_table、total_impressions、total_clicks、total_cost、CTR、引流效率、latest_live_acceptance_status、样本门槛和刷新状态。',
      '无引流快照时输出 content_only；不得判断放量、暂停或进房质量。',
    ],
    [
      'traffic_raw_trace',
      'ods.douyin_qianchuan_live_video_raw',
      '千川直播引流短视频原始素材表现字段、原始口径和刷新批次。',
      '只在需要复核 DWS 汇总、objective 或异常字段时回看；页面默认以 DWS 汇总为主。',
    ],
    [
      'live_acceptance_context',
      'dws.marketing_content_qianchuan_live_room_acceptance_di + ods.douyin_trade_sale_live_raw',
      '账号/日期级 live_watch_user_count、live_product_click_user、product_click_rate_user、watch_to_pay_rate_user、click_to_pay_rate_user、live_order_count、live_gmv、net_gmv、refund_rate_1h、acceptance_quality_status。',
      '缺承接数据时只能评价素材引流侧；不得评价直播间是否接住。',
    ],
    [
      'session_review_context',
      'ads.douyin_live_detail',
      '主播、账号、直播开始/结束时间、场次状态和必要场次上下文。',
      '只作复核和提高置信度；不能替代 material_id 级成交归因。',
    ],
  ],
};

const LIVE_METRIC_DICTIONARY_TABLE: DocsTable = {
  title: '指标口径与样本门槛',
  headers: ['指标', '来源字段 / 表', '分析用途', '门槛或降级规则'],
  rows: [
    [
      '曝光 / 点击 / 消耗',
      'dws.marketing_content_qianchuan_material_summary；必要时追溯 ods.douyin_qianchuan_live_video_raw。',
      '判断素材引流样本、点击成本和投放放量基础。',
      '样本不足时只允许 continue_observation；不能判断直播间承接强弱。',
    ],
    [
      'CTR / 进房率 / 进房成本',
      'DWS 直播引流表现快照，source_table=ods.douyin_qianchuan_live_video_raw。',
      '判断素材是否让目标人群产生进房意图。',
      '进房率弱优先改钩子、直播利益点和 CTA；不得直接归因到主播或货盘。',
    ],
    [
      'live_watch_user_count / live_product_click_user',
      'dws.marketing_content_qianchuan_live_room_acceptance_di，底层承接环境来自 ods.douyin_trade_sale_live_raw。',
      '判断进入直播间后是否有停留和商品点击承接。',
      '只有账号/日期级数据时标注 account-date acceptance environment，不写素材级成交贡献。',
    ],
    [
      'product_click_rate_user / watch_to_pay_rate_user / click_to_pay_rate_user',
      '直播间承接汇总层。',
      '拆分直播间首屏、主播话术、货盘和商品卡是否接住素材承诺。',
      '缺承接数据时降级为 missing_acceptance，只输出补证据和下一场复核动作。',
    ],
    [
      'UV value / GPM / live_gmv',
      '直播间承接汇总层 + 账号/日期级直播成交源。',
      '判断直播间承接效率和成交环境。',
      '用于承接环境判断，不代表单个 material_id 精确成交归因。',
    ],
    [
      'net_gmv / refund_rate_1h',
      '直播间承接汇总层和退款/售后证据。',
      '识别直播间承接质量、短期退款和履约风险。',
      '退款风险高时输出 check_offer_price / check_product_sku / risk_review，不直接判素材差。',
    ],
    [
      'alignment_level',
      'material_id 投放窗口 + 账号/日期 + ads.douyin_live_detail 场次上下文。',
      '决定承接结论是 session_aligned、account_date、account_range 还是 missing_acceptance。',
      '未达到 session_aligned 时，必须降低置信度并写明复核条件。',
    ],
  ],
};

const LIVE_DATA_AVAILABILITY_TABLE: DocsTable = {
  title: '数据可用性与降级策略',
  headers: ['数据状态', '允许输出', '禁止输出'],
  rows: [
    [
      '未确认 asset_id',
      '提示先从 ads.marketing_content_assets 选择素材，保留素材身份待确认。',
      '禁止生成正式 AI 分析或直播承接结论。',
    ],
    [
      '无 material_id 绑定',
      '只做内容初评：钩子、直播指向、福利承诺、CTA 和素材档案建议。',
      '禁止给千川进房效率、直播承接、成交或预算动作结论。',
    ],
    [
      '多个 material_id 未确认',
      '展示冲突列表，要求业务选择实例或按实例分别诊断。',
      '禁止自动聚合进房/成交数据，也禁止默认把多实例当成一条素材。',
    ],
    [
      '无千川引流表现',
      '输出 content_only 或 data_missing，建议刷新汇总层或补素材实例绑定。',
      '禁止判断进房成本、引流质量、放量或暂停。',
    ],
    [
      '无直播承接数据',
      '只判断素材进房意图和内容问题；把直播间承接列为待补证据。',
      '禁止输出直播间货盘、主播话术、成交承接强弱的确定性结论。',
    ],
    [
      '只有账号/日期级承接',
      '可判断 account-date acceptance environment，输出中低置信的承接环境判断。',
      '禁止写成单个 material_id、单个场次或单条视频的精确成交贡献。',
    ],
    [
      '样本不足或场次无法对齐',
      '输出 continue_observation、补样本、补场次复核和人工核对动作。',
      '禁止强放量、强暂停、归因到主播/货盘/素材任一单点责任。',
    ],
  ],
};

const LIVE_DIAGNOSIS_TABLE: DocsTable = {
  title: '诊断维度与证据拆分',
  headers: ['诊断问题', '必须看什么', '判断重点'],
  rows: [
    [
      '素材是否带来正确进房意图',
      '前 3 秒钩子、痛点/福利承诺、直播间指向、进房率、点击成本和停留线索。',
      '重点判断用户为什么进房：福利、痛点、商品兴趣、主播信任，还是泛流量误入。',
    ],
    [
      '直播间是否接得住',
      '直播间首屏、主播开场、主推货盘、价格机制、商品卡点击、成交和退款环境。',
      '承接弱时不能直接判定素材差，要拆出直播间 offer、货盘、价格信任或话术问题。',
    ],
    [
      '素材和直播间是否一致',
      '视频承诺、口播卖点、直播间正在讲的商品、福利和商品卡承接。',
      '素材承诺与直播间首屏/主播话术不一致时，优先输出对齐动作而不是单纯复剪。',
    ],
    [
      '是否值得继续投放',
      '样本门槛、进房质量、直播承接环境、退款风险和同 objective benchmark。',
      '引流型素材看进房意图和承接质量，不用挂车短视频的单素材成交口径直接套用。',
    ],
  ],
};

const LIVE_ATTRIBUTION_CONFIDENCE_TABLE: DocsTable = {
  title: '直播归因置信等级',
  headers: ['等级', '对齐条件', '允许结论'],
  rows: [
    [
      'session_aligned（场次可对齐）',
      'material_id 投放窗口、账号、直播时间和 ads.douyin_live_detail 场次可以对齐。',
      '可以做较强的素材引流 + 场次承接判断，但仍需说明成交不是自动等于素材贡献。',
    ],
    [
      'account_date',
      '只能按账号 + 日期把素材引流表现与 dws/ODS 直播承接环境对齐。',
      '可以判断当天直播间承接环境强弱，必须标注不是 material_id 精确归因。',
    ],
    [
      'account_range',
      '只能按账号 + 时间范围近似对齐，场次或投放窗口存在不确定。',
      '只能输出方向性观察和人工复核动作，不做预算放量或素材淘汰强判断。',
    ],
    [
      'missing_acceptance',
      '没有可用直播承接数据，或承接数据刷新失败。',
      '只能分析素材内容和引流侧表现，不能评价直播间是否接住。',
    ],
  ],
};

const LIVE_WORKFLOW_STEPS: DocsStep[] = [
  { title: '1. 确认素材和实例', desc: '从 ads.marketing_content_assets 定位 asset_id，再用 ads.marketing_content_ad_materials.external_material_id 对齐千川 material_id。' },
  { title: '2. 确认投放目标', desc: '读取 dws.marketing_content_qianchuan_material_summary，确认 objective=live_all_domain_shortvideo。' },
  { title: '3. 拉取素材引流表现', desc: '核对 source_table=ods.douyin_qianchuan_live_video_raw，读取曝光、点击、消耗、进房和引流效率。' },
  { title: '4. 补直播间承接环境', desc: '合并 dws.marketing_content_qianchuan_live_room_acceptance_di，并用 ods.douyin_trade_sale_live_raw 理解账号/日期级成交环境。' },
  { title: '5. 必要时复核场次', desc: '用 ads.douyin_live_detail 查看对应账号、直播时间、主播和场次上下文，避免误把场次问题归因给素材。' },
  { title: '6. 输出分层动作', desc: '分别给素材动作和直播间动作，例如 rewrite_hook、align_video_to_live_room_offer、check_live_room_script、check_offer_price。' },
];

const LIVE_DECISION_RULE_TABLE: DocsTable = {
  title: '引流 / 承接动作规则',
  headers: ['动作', '触发条件', '复查窗口与保护栏'],
  rows: [
    [
      'scale_or_keep_traffic',
      '进房成本、进房率、停留/互动线索和直播承接环境同时稳定，且素材承诺与直播间 offer 一致。',
      '小步放量；下一场继续看进房后商品点击率、UV value、GPM、退款和自然流量占比。',
    ],
    [
      'rewrite_hook',
      '曝光或点击不弱，但进房意图泛、首屏承诺不清、直播指向弱或 CTA 不明确。',
      '复剪必须明确“为什么进房”和“进房后看到什么”；新版本独立观察进房成本和停留。',
    ],
    [
      'align_video_to_live_room_offer',
      '素材承诺的福利、商品、价格或主播场景与直播间首屏/开场话术不一致。',
      '短视频与直播运营共同改；下一场先看进房后 1-3 分钟商品点击和停留变化。',
    ],
    [
      'check_live_room_script / check_offer_price',
      '素材进房信号尚可，但直播间商品点击、支付、GPM、UV value 或退款环境弱。',
      '直播运营优先查开场话术、货盘、价格机制、赠品和信任背书，不直接判素材差。',
    ],
    [
      'pause_or_reduce_budget',
      '样本达标后进房意图弱、泛流量占比高、承接环境无修复空间，或退款/履约风险高。',
      '暂停理由必须分别引用素材引流证据和直播承接证据；承接数据不足时只能降级观察。',
    ],
  ],
};

const LIVE_ECONOMICS_GUARDRAIL_TABLE: DocsTable = {
  title: '直播引流放量保护栏',
  headers: ['保护栏', '必须补的证据', '决策规则'],
  rows: [
    [
      '进房成本 vs 承接价值',
      '素材消耗、进房量/进房成本、直播间 UV value、GPM、商品点击率和支付转化。',
      '进房便宜不等于可放量；只有进房意图和直播间承接价值同时稳定，才允许 scale_or_keep_traffic。',
    ],
    [
      '账号/日期级毛利保护',
      '直播间商品毛利、平台费、履约/赠品成本、退款损失、当日广告消耗和目标贡献利润。',
      '缺毛利或成本时只能写“承接效率判断”，不能写“盈利归因”；结论必须标注 profit_context_missing。',
    ],
    [
      '素材承诺一致性',
      '短视频福利/价格/主推商品/主播场景与直播间首屏、开场话术、货盘和商品卡。',
      '承诺不一致时先输出 align_video_to_live_room_offer，不直接加预算。',
    ],
    [
      '边际承接衰减',
      '放量后下一场或下一窗口的新增进房、新增商品点击、UV value、GPM、退款和互动变化。',
      '边际进房成本上升、商品点击下降或退款抬升时，优先 cap_budget 并修直播承接，不继续扩大泛流量。',
    ],
    [
      '场次/账号归因等级',
      'material_id 投放窗口、账号、日期、直播场次、ads.douyin_live_detail 复核状态。',
      '只有 account_date 或 account_range 时，所有成交/退款/ROI 只能作为承接环境，不写成单个 material_id 贡献。',
    ],
  ],
};

const LIVE_SIGNAL_DECISION_MATRIX_TABLE: DocsTable = {
  title: '常见引流与承接决策矩阵',
  headers: ['引流信号', '承接信号', 'Owner / 动作', '归因边界'],
  rows: [
    [
      'CTR 和进房率不弱，进房成本可接受。',
      '商品点击率、UV value、GPM 或 watch_to_pay_rate_user 弱。',
      '直播运营优先改首屏、开场话术、主推 SKU、福利机制和商品卡；短视频负责人只同步素材承诺。',
      '判断为直播间承接环境偏弱；除非达到 session_aligned，否则不写成单 material_id 成交贡献。',
    ],
    [
      'CTR 不弱，但进房率弱或进房理由不清。',
      '承接数据即使正常，也不能证明素材带来了正确人群。',
      '短视频负责人重写“为什么现在进房”的利益点、主播/场景露出和 CTA；投放负责人复核人群定向。',
      '优先归因素材引流意图不足；不把问题推给直播间货盘或主播。',
    ],
    [
      '进房成本低、进房量增长快。',
      '退款、net_gmv、UV value 或 GPM 走弱，且互动/停留质量差。',
      '投放负责人 cap_budget；直播/商品负责人复核低价福利、货盘利润、退款原因和泛流量占比。',
      '禁止因为进房便宜就 scale_or_keep_traffic；只能写承接价值未证明。',
    ],
    [
      '素材承诺了特定福利、价格、商品或主播场景。',
      '直播间首屏、开场话术、当前主推 SKU 或商品卡没有承接同一承诺。',
      '短视频负责人和直播运营共同做 align_video_to_live_room_offer；下一场复查进房后 1-3 分钟停留和商品点击。',
      '归因是素材-直播间对齐问题，不是单独素材差或直播间差。',
    ],
    [
      '素材引流表现有样本。',
      '缺 dws.marketing_content_qianchuan_live_room_acceptance_di 或 ods.douyin_trade_sale_live_raw 承接环境。',
      '只输出素材引流侧诊断；数据负责人补承接汇总或场次候选窗口；业务等下一场复核。',
      'live_acceptance_attribution=missing_acceptance；禁止评价直播间是否接住。',
    ],
    [
      'material_id 投放窗口只能和账号/日期或时间范围粗对齐。',
      '承接数据来自 account_date 或 account_range，而非明确场次。',
      '输出方向性观察和人工复核动作；必要时用 ads.douyin_live_detail 补主播、时间、货盘和场次状态。',
      '必须降低 confidence；禁止写“该 material_id 贡献了直播成交 xx 元”。',
    ],
  ],
};

const LIVE_OUTPUT_TABLE: DocsTable = {
  title: '输出物与动作合同',
  headers: ['输出模块', '必须回答的问题', '典型动作'],
  rows: [
    [
      '引流质量',
      '这条素材带来的人群是否愿意进房、进房理由是什么、是否和直播间当前 offer 匹配？',
      '保留、放量、改钩子、强化直播利益点、调整定向或继续观察。',
    ],
    [
      '素材问题',
      '前三秒、卖点、福利、直播指向、主播/场景露出和 CTA 是否足够清晰？',
      'rewrite_hook、adjust_first_3s_visual、make_cta_explicit、align_video_to_live_room_offer。',
    ],
    [
      '直播间承接问题',
      '直播间首屏、主播话术、货盘、价格、赠品和信任背书是否接住素材承诺？',
      'check_live_room_script、check_live_offer、check_offer_price、add_trust_proof。',
    ],
    [
      '归因边界',
      '当前成交、退款或 ROI 证据能否支持素材级结论，还是只能说明直播间承接环境？',
      '写明 account-date acceptance environment，必要时转人工复核或补场次证据。',
    ],
  ],
};

const LIVE_OWNER_ACTION_TABLE: DocsTable = {
  title: 'Owner 动作拆分',
  headers: ['Owner', '拿到的动作', '复查指标'],
  rows: [
    [
      '短视频负责人',
      '改前 3 秒、直播利益点、主播/场景露出、CTA、素材与直播 offer 一致性。',
      'CTR、进房率、进房成本、进房后停留和素材评论问题。',
    ],
    [
      '投放负责人',
      '调整预算节奏、定向、计划拆分、低预算观察或暂停降预算。',
      '消耗、进房成本、边际 ROI、样本门槛和计划间差异。',
    ],
    [
      '直播运营',
      '调整首屏、主播开场、主推货盘、价格机制、赠品和信任背书。',
      '商品点击率、支付 CVR、UV value、GPM、停留和互动问题。',
    ],
    [
      '商品运营',
      '核对主推 SKU、库存、券后价、评价、售后承诺和退款原因。',
      '成交质量、退款率/退款金额、库存风险、价格一致性和评价变化。',
    ],
  ],
};

const LIVE_SAMPLE_OUTPUT_TABLE: DocsTable = {
  title: '标准输出样例',
  headers: ['模块', '样例', '证据要求'],
  rows: [
    [
      '主结论',
      'align_video_to_live_room_offer + check_live_room_script：素材能带来进房，但直播间首屏没有接住素材承诺。',
      '必须引用进房率/进房成本/素材钩子，以及直播间商品点击率、UV value、GPM 或承接环境证据。',
    ],
    [
      '归因边界',
      '当前承接证据为 account_date acceptance environment，不能写成该 material_id 精确贡献了直播成交。',
      '输出 live_acceptance_attribution=account_date，并说明需要场次复核才能提高置信度。',
    ],
    [
      '动作',
      '短视频负责人强化直播利益点；直播运营把首屏福利和主播开场对齐；投放负责人维持小预算等下一场复查。',
      '每条 next_actions 必须有 owner、action_type、priority、reason、expected_metric_lift、evidence_refs。',
    ],
    [
      '复查',
      '下一场直播复查进房后商品点击率、1-3 分钟停留、UV value、GPM、退款环境和素材计划边际成本。',
      '没有下一场承接数据前，不自动放量，也不把直播承接弱判成素材淘汰。',
    ],
  ],
};

const LIVE_AI_SCHEMA_TABLE: DocsTable = {
  title: 'AI v2.1 字段合同',
  headers: ['字段', '直播引流型要求'],
  rows: [
    ['delivery_mode', '固定为 delivery_mode = qianchuan_all_domain，说明这是千川全域素材数据融合诊断。'],
    ['analysis_schema_version', '固定展示 analysis_schema_version=2.1，便于和素材中台 AI 写回结果对齐。'],
    ['asset_identity', '必须写明素材数据库 ads.marketing_content_assets、asset_id、绑定库 ads.marketing_content_ad_materials、material_id、objective 和 source_table。'],
    ['diagnosis_mode', '标明 data_content_fusion / data_only / content_only / insufficient_data，避免把降级结果写成完整结论。'],
    ['sample_gate', '写清曝光、点击、消耗、进房和直播承接样本门槛；样本不足时只给 continue_observation 或补样本动作。'],
    ['benchmark_context', '说明同 objective benchmark 的窗口、来源和是否降级为 fallback。'],
    ['decision_case', '引用常见引流与承接矩阵中的分支，例如 entry_ok_acceptance_weak、entry_intent_weak、cheap_entry_low_value、offer_misaligned、missing_acceptance。'],
    ['evidence_ledger / metric_evidence / content_evidence', '每条结论要引用素材引流指标、直播间承接指标和内容证据，避免只用一段口播或单一 ROI 下结论。'],
    ['live_acceptance_attribution', '必须写明 account-date acceptance environment；直播成交、退款、ROI 不代表 exact material_id attribution。'],
    ['primary_decision', '输出素材侧和直播间侧的主判断，例如 align_video_to_live_room_offer、check_live_room_script、check_offer_price 或 continue_observation。'],
    ['next_actions', '动作必须包含 owner、action_type、priority、reason、expected_metric_lift 和 evidence_refs，并区分素材动作与直播间动作。'],
    ['scores', '至少解释 data_performance_score、hook_score、live_entry_score、live_acceptance_score、risk_score、fusion_overall_score 和 confidence。'],
  ],
};

const LIVE_REVIEW_SCORE_TABLE: DocsTable = {
  title: '方案自检评分（100 分）',
  headers: ['维度', '分值', '达标标准'],
  rows: [
    [
      '素材身份与数据库标注',
      '15',
      '页面和 AI 输出都明确 ads.marketing_content_assets、asset_id、ads.marketing_content_ad_materials、material_id 与 objective=live_all_domain_shortvideo。',
    ],
    [
      '直播引流表现完整度',
      '18',
      '读取 dws.marketing_content_qianchuan_material_summary，并能追溯 ods.douyin_qianchuan_live_video_raw；展示进房、消耗、样本门槛和 source_table。',
    ],
    [
      '直播间承接环境完整度',
      '20',
      '读取 dws.marketing_content_qianchuan_live_room_acceptance_di，并说明来自 ods.douyin_trade_sale_live_raw 的账号/日期级承接环境；必要时用 ads.douyin_live_detail 复核场次。',
    ],
    [
      '素材与直播间一致性诊断',
      '17',
      '能拆出素材钩子、人群进房意图、直播间首屏、offer、货盘、主播话术和商品卡承接是否一致。',
    ],
    [
      '归因边界与置信等级',
      '15',
      '明确 live_acceptance_attribution 与 session_aligned / account_date / account_range / missing_acceptance 等置信等级；不把直播成交写成单 material_id 精确归因。',
    ],
    [
      '动作可执行性与复核',
      '15',
      '动作分配给短视频、投放、直播运营、商品运营 owner，并给下一场或下一窗口的复查指标和人工复核条件。',
    ],
  ],
};

const LIVE_CURRENT_SCORE_TABLE: DocsTable = {
  title: '当前成熟度评分',
  headers: ['评分对象', '当前分', '为什么不是 100 分'],
  rows: [
    [
      '方案设计成熟度',
      '94 / 100',
      '素材身份、直播引流 objective、DWS/ODS、直播间承接源、归因边界和常见引流/承接决策矩阵已经明确；剩余差距在自动场次对齐、毛利/成本接入、动态 benchmark 和真实样本回归。',
    ],
    [
      '可直接指导业务复盘',
      '92 / 100',
      '已经能把素材进房、直播间承接、offer 对齐和退款/毛利风险拆成 owner 动作；但 account-date 承接环境仍不能替代 material_id 精确归因，强放量结论需要更多场次证据。',
    ],
    [
      '可直接作为 runtime 验收合同',
      '88 / 100',
      '字段、降级、动作、live_acceptance_attribution 和信号矩阵已明确；还需要后续 runtime 任务把 alignment_level、profit_context、session_review_context、decision_case 和 evidence_refs 写入 AI 结果。',
    ],
  ],
};

const LIVE_OPTIMIZATION_BACKLOG_TABLE: DocsTable = {
  title: '后续优化优先级',
  headers: ['优先级', '优化项', '验收标准'],
  rows: [
    [
      'P0',
      '建立 material_id 投放窗口到直播场次的 alignment_level 计算。',
      'AI 能自动区分 session_aligned、account_date、account_range、missing_acceptance，并按等级降置信度。',
    ],
    [
      'P0',
      '把直播间毛利、退款损失和商品成本接进承接环境。',
      'UV value/GPM 达标但退款或毛利不达标时，AI 自动输出 risk_review 或 check_offer_price，而不是放量。',
    ],
    [
      'P1',
      '补直播间首屏/开场话术/主推 SKU 的结构化证据。',
      '素材承诺与直播间 offer 不一致时，AI 能给出具体对齐动作和 owner。',
    ],
    [
      'P1',
      '沉淀同 objective + 同账号/同场次类型的引流 benchmark。',
      '进房率、进房成本、商品点击率、UV value 的“好/坏”都有对照窗口和样本量。',
    ],
    [
      'P2',
      '把素材动作和直播间动作的采纳结果回写评估集。',
      '下一场复查能判断 rewrite_hook、align_video_to_live_room_offer、check_live_room_script 是否实际改善承接。',
    ],
  ],
};

const LIVE_DATA_READINESS_TABLE: DocsTable = {
  title: '上线前数据验收探针',
  headers: ['探针', '通过条件', '失败时处理'],
  rows: [
    [
      '素材库身份',
      'asset_id 可在 ads.marketing_content_assets 命中，且标题、预览、封面、transcript、直播利益点或素材档案至少有一类可读。',
      '回到素材库补档案或重新入库；AI 只允许输出内容初评和身份缺失提示。',
    ],
    [
      '直播引流实例',
      'ads.marketing_content_ad_materials 存在 active qianchuan 绑定，external_material_id 非空且等于千川 material_id。',
      '提示补千川素材 ID；多个 material_id 时必须按实例分别复盘。',
    ],
    [
      'objective 对齐',
      'dws.marketing_content_qianchuan_material_summary 的 objective=live_all_domain_shortvideo，source_table 指向 ods.douyin_qianchuan_live_video_raw。',
      '不允许套用挂车带货方案；展示 objective 冲突并进入人工复核。',
    ],
    [
      '直播承接环境',
      'dws.marketing_content_qianchuan_live_room_acceptance_di 可按账号/日期或场次候选窗口提供承接环境，并说明来自 ods.douyin_trade_sale_live_raw。',
      '降级为 missing_acceptance；只能评价素材引流侧，不评价直播间承接强弱。',
    ],
    [
      '场次复核',
      '需要提高置信度时，ads.douyin_live_detail 能提供主播、账号、直播开始/结束时间和场次上下文。',
      '标记 alignment_level=account_date 或 account_range，不输出素材级成交贡献。',
    ],
  ],
};

const LIVE_ANTI_PATTERN_TABLE: DocsTable = {
  title: '禁止输出与改写规则',
  headers: ['禁止写法', '为什么错', '应改成'],
  rows: [
    [
      '“这条 material_id 带来了直播成交 xx 元。”',
      '当前直播成交来自账号/日期或场次承接环境，默认不是单个 material_id 精确成交归因。',
      '“当前为 account-date acceptance environment，只能说明直播间承接环境；需场次级证据才能提高置信度。”',
    ],
    [
      '“直播间没成交，所以素材差。”',
      '成交弱可能来自主播开场、货盘、价格机制、福利承诺、库存或信任背书。',
      '“素材进房信号与直播间承接拆开判断；若进房不弱但承接弱，派 check_live_room_script / check_offer_price。”',
    ],
    [
      '“进房率高，直接放量。”',
      '直播引流还要看进房意图、停留、商品点击、UV value、GPM、退款和直播间 offer 一致性。',
      '“进房效率达标但需确认承接环境稳定，再小步 scale_or_keep_traffic 并设置下一场复查指标。”',
    ],
    [
      '“直播素材和挂车短视频共用 ROI 判断。”',
      '两者 objective、成交承接和归因边界不同，不能共用同一套 ROI 决策。',
      '“按 live_all_domain_shortvideo 使用引流 + 承接方案；挂车成交素材另走 product_all_domain_shortvideo。”',
    ],
  ],
};

const LIVE_BOUNDARY_ROWS: DocsRow[] = [
  { label: '核心边界', value: '直播间成交数据不代表单个 material_id 精确成交归因；它是账号/日期级直播间承接环境。' },
  { label: '素材判断', value: '直播引流素材先判断进房意图、钩子和人群匹配，再看直播间是否接得住。' },
  { label: '承接判断', value: '承接弱可能来自直播间货盘、主播话术、价格机制或信任背书，不应直接写成素材差。' },
  { label: '复核路径', value: '需要场次上下文时，用 ads.douyin_live_detail 做主播、时间、账号、货盘和直播状态复核。' },
  { label: '投放口径', value: 'dws.marketing_content_qianchuan_material_summary 保留 objective 和 source_table，页面必须展示当前实例来自直播引流口径。' },
  { label: '实现边界', value: '本页只沉淀方案与后续验收合同，不代表当前 AI job 已经按全部 v2.1 字段自动产出；runtime 接入需另行实现和验收。' },
];

export const DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PAGE: DocsPageModel = {
  key: 'analysis-plans',
  path: DOUYIN_QIANCHUAN_LIVE_TRAFFIC_SHORTVIDEO_AI_ANALYSIS_PATH,
  eyebrow: 'Analysis Plan',
  title: '千川直播短视频引流 AI 分析',
  subtitle: '面向直播间引流素材，把素材视频、素材数据库、千川引流表现和直播间承接环境合并诊断，区分素材钩子问题、人群进房意图和直播间承接问题。',
  primaryAction: {
    href: ROUTE_PATHS.docsAnalysisPlans,
    label: '返回方案库',
  },
  sections: [
    {
      id: 'plan-positioning',
      title: '方案定位',
      paragraphs: [
        '这套方案的重点不是判断短视频是否直接卖货，而是判断它是否把正确的人群带进直播间，以及直播间是否接住了这批人。AI 必须同时读取素材本身、素材档案、千川引流表现和直播间承接环境。',
      ],
      rows: [
        { label: '核心目标', value: 'objective=live_all_domain_shortvideo，判断短视频是否带来正确进房意图和有效直播引流。' },
        { label: '主要问题', value: '问题来自素材钩子/人群筛选，还是直播间 offer、货盘、主播话术、价格信任承接？' },
        { label: '分析输入', value: '素材本体、素材档案、广告素材实例、千川直播引流表现、直播间承接环境和必要场次上下文。' },
        { label: '业务输出', value: '分别给素材复剪动作、直播间承接动作、投放观察窗口和归因边界说明。' },
      ],
    },
    {
      id: 'execution-summary',
      title: '先读结论',
      lead: '直播引流比挂车多一层承接环境；先判断证据能不能支持承接结论，再决定预算动作。',
      rows: LIVE_EXECUTION_SUMMARY_ROWS,
    },
    {
      id: 'data-sources',
      title: '素材数据库与数据源',
      lead: '直播引流方案必须比挂车方案多一层直播间承接环境；成交和退款只能作为承接背景，不能自动写成单素材成交归因。',
      tables: [
        LIVE_DATA_SOURCE_TABLE,
        LIVE_DISPLAY_CONTRACT_TABLE,
        LIVE_CONTEXT_PACK_TABLE,
        LIVE_METRIC_DICTIONARY_TABLE,
        LIVE_DATA_AVAILABILITY_TABLE,
      ],
    },
    {
      id: 'analysis-workflow',
      title: '执行路径',
      lead: '先对齐素材身份和 objective，再把引流表现与直播间承接环境分层解释。',
      steps: LIVE_WORKFLOW_STEPS,
      tables: [LIVE_DIAGNOSIS_TABLE, LIVE_ATTRIBUTION_CONFIDENCE_TABLE],
    },
    {
      id: 'output-contract',
      title: '输出物与动作合同',
      lead: '结论必须拆成素材动作和直播间动作，避免把直播间承接弱简单归因给素材。',
      tables: [
        LIVE_AI_SCHEMA_TABLE,
        LIVE_ECONOMICS_GUARDRAIL_TABLE,
        LIVE_SIGNAL_DECISION_MATRIX_TABLE,
        LIVE_DECISION_RULE_TABLE,
        LIVE_OUTPUT_TABLE,
        LIVE_OWNER_ACTION_TABLE,
        LIVE_SAMPLE_OUTPUT_TABLE,
        LIVE_DATA_READINESS_TABLE,
        LIVE_ANTI_PATTERN_TABLE,
        LIVE_REVIEW_SCORE_TABLE,
      ],
    },
    {
      id: 'maturity-score',
      title: '当前评分与后续优化',
      lead: '当前评分只评价方案设计和验收合同，不代表 AI runtime 已经自动完成场次对齐或 material_id 级归因。',
      tables: [LIVE_CURRENT_SCORE_TABLE, LIVE_OPTIMIZATION_BACKLOG_TABLE],
    },
    {
      id: 'attribution-boundary',
      title: '归因边界与复核',
      lead: '直播引流型素材的成交解释要特别保守：直播间成交环境能说明承接强弱，但不等于 material_id 级精确归因。',
      rows: LIVE_BOUNDARY_ROWS,
    },
  ],
};
