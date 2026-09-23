import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { DocsCard, DocsPageModel, DocsRow, DocsStep, DocsTable } from '../docs-workspace-data';

export const DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PATH = `${ROUTE_PATHS.docsAnalysisPlans}/douyin-qianchuan-product-shortvideo-ai-analysis`;

export const DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_CARD: DocsCard = {
  title: '千川挂车带货短视频 AI 分析',
  desc: '面向商品卡 / 挂车成交素材，结合素材本体、素材数据库和千川表现，判断是否放量、复剪、换卖点或暂停。',
  href: DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PATH,
  action: '进入方案',
  meta: '千川 / 挂车带货 / 素材数据融合',
  tags: ['千川', '挂车带货', '素材数据'],
  details: [
    { label: '定位', value: 'objective=product_all_domain_shortvideo，先判断素材是否能推动商品卡点击和成交。' },
    { label: '素材库', value: 'ads.marketing_content_assets + ads.marketing_content_ad_materials，先确认 asset_id 与 material_id。' },
    { label: '数据源', value: '千川挂车表现来自 ods.douyin_qianchuan_shortvideo_raw；商品卡承接不在这张表里，需另取 ods.douyin_trade_sale_card_detail_raw，并在取得 product_id 后按日期窗口 / source_level1 做承接上下文关联。' },
    { label: '输出', value: '放量/复剪/暂停判断、卖点问题、证据引用和下一版动作。' },
  ],
};

const PRODUCT_DATA_SOURCE_TABLE: DocsTable = {
  title: '素材数据库、千川表现源与商品卡承接源',
  headers: ['层级', '表 / 对象', '用途', '关键字段或边界'],
  rows: [
    [
      '素材本体库',
      'ads.marketing_content_assets',
      '确认被分析的原始素材、预览、封面、transcript、标题、标签、档案和 AI 摘要。',
      '以 asset_id 标识素材本身；页面需要先说明素材来自这个素材数据库，而不是只分析一段视频。',
    ],
    [
      '广告素材实例绑定库',
      'ads.marketing_content_ad_materials',
      '把素材本体绑定到千川广告素材实例。',
      'external_material_id 对应千川 material_id；一个 asset_id 可绑定多个 material_id，但单次诊断要明确当前实例。',
    ],
    [
      'AI / 页面可用汇总层',
      'dws.marketing_content_qianchuan_material_summary',
      '给详情页和 AI 分析读取千川素材表现快照。',
      '保留 objective、source_table、消耗、曝光、点击、转化、成交、退款和样本门槛信息。',
    ],
    [
      '挂车成交型 ODS 源',
      'ods.douyin_qianchuan_shortvideo_raw',
      '商品全域 / 挂车成交型短视频素材表现源。',
      'objective=product_all_domain_shortvideo；用于判断 material_id 的曝光、点击、消耗、成交、净成交和退款风险；不提供 product_id、source_level1 或 card_* 商品卡来源层级明细。',
    ],
    [
      '商品卡承接 ODS 源',
      'ods.douyin_trade_sale_card_detail_raw',
      '商品卡流量来源明细，用于补充商品卡曝光、点击、点击成交、支付、加购、收藏等承接信号。',
      '关键粒度是 shop_id + stat_date + product_id + source_level1；只能作为商品/日期/来源承接上下文，不能默认等同于单 material_id 精确成交归因。',
    ],
    [
      '商品卡 ADS 镜像',
      'ads.douyin_trade_sale_card_detail',
      '商品卡看板 serving 表，字段镜像 ods.douyin_trade_sale_card_detail_raw。',
      '可用于页面查询和 dashboard 复核，但方案合同优先标明 ODS 真源；主键为 shop_id、stat_date、product_id、source_level1。',
    ],
  ],
};

const PRODUCT_DISPLAY_CONTRACT_TABLE: DocsTable = {
  title: '页面展示合同',
  headers: ['展示区块', '必须标明', '用途'],
  rows: [
    [
      '素材身份',
      '素材数据库=ads.marketing_content_assets、asset_id、标题/封面/transcript/素材档案。',
      '先证明分析对象是哪条素材，避免只对一段视频做脱库评价。',
    ],
    [
      '千川实例',
      '绑定库=ads.marketing_content_ad_materials、material_id、objective=product_all_domain_shortvideo。',
      '说明当前诊断的是哪个广告素材实例；多 material_id 时必须让用户知道当前实例。',
    ],
    [
      '表现窗口',
      '汇总层=dws.marketing_content_qianchuan_material_summary、source_table、first_stat_date、last_stat_date、updated_at。',
      '证明数据窗口和刷新时间，避免把过期或不完整数据当成当前结论。',
    ],
    [
      '样本状态',
      'data_quality_status、sample_quality_status、diagnosis_status、benchmark_context、confidence、缺失字段提示。',
      '让用户知道结论是完整融合、数据降级、内容初评还是证据不足。',
    ],
    [
      '商品承接',
      '商品卡承接源=ods.douyin_trade_sale_card_detail_raw、product_id、stat_date、source_level1、card_click_rate_user、card_click_to_pay_rate_user、card_user_pay_amount。',
      '点击或成交弱时先按商品/日期/来源拆承接问题；没有 product_id 或日期窗口时不能把商品卡表现写成素材归因。',
    ],
  ],
};

const PRODUCT_CARD_ACCEPTANCE_LINK_TABLE: DocsTable = {
  title: '商品卡承接关联路径',
  headers: ['步骤', '关联键 / 前提', '允许结论', '边界'],
  rows: [
    [
      '1. 先锁定千川素材实例',
      'ads.marketing_content_ad_materials.external_material_id -> material_id；表现源必须是 ods.douyin_qianchuan_shortvideo_raw。',
      '可以评价该 material_id 的千川挂车投放表现、样本门槛、ROI、净成交和退款风险。',
      '这一步拿不到商品卡 source_level1 和 card_* 明细；不能说已经完成商品卡承接判断。',
    ],
    [
      '2. 再取得商品映射',
      'product_id 必须来自素材商品档案、挂车商品解析、商品页证据、短视频明细或人工维护；不能从 ods.douyin_qianchuan_shortvideo_raw 直接推断。',
      '可以进入商品卡承接补证据流程，并标注 product_id 来源和可信度。',
      '没有 product_id 或商品映射不可信时，只能输出 missing_card_acceptance。',
    ],
    [
      '3. 拉取商品卡承接 ODS',
      '用 shop/account、product_id、stat_date 或投放日期窗口、source_level1 查询 ods.douyin_trade_sale_card_detail_raw。',
      '可以写“该商品在当前投放窗口内的商品卡承接表现”，引用 card_click_rate_user、card_click_to_pay_rate_user、card_user_pay_amount、card_order_count。',
      '这是商品/日期/来源层级承接上下文，不是 material_id 级商品卡成交归因。',
    ],
    [
      '4. 输出可信等级',
      '按 product_day_aligned、product_range_aligned、account_date_context、missing_card_acceptance 分级。',
      'AI 结论可以解释成交断点更像素材 CTA、商品卡主图/价格/评价、库存履约还是样本不足。',
      '除非另有可验证的素材到商品点击链路，否则禁止写“这个 material_id 带来商品卡 GMV”。',
    ],
  ],
};

const PRODUCT_EXECUTION_SUMMARY_ROWS: DocsRow[] = [
  { label: '什么时候用', value: '素材目标是千川挂车 / 商品全域短视频，当前要判断 material_id 是否值得放量、复剪、观察或暂停。' },
  { label: '先验三件事', value: '先确认 ads.marketing_content_assets 的 asset_id、active 千川 material_id、dws 汇总快照；任一缺失都不能给正式投放结论。' },
  { label: '核心读法', value: '先看视频钩子和商品露出，再看 CTR/CVR/消耗/GMV/GSV/ROI，最后用净成交、结算、退款和商品页承接保护放量判断。' },
  { label: '第一优先动作', value: '先过 sample_gate 与数据可用性；样本不足只补样本或继续观察，样本足够才进入 scale_budget / make_variant / check_product_card / pause。' },
  { label: '当前状态', value: '本页是 docs-level analysis plan / contract；本任务不改 AI runtime、后端 API、数据库 schema 或 job 队列，后续 runtime 接入需另起实现任务。' },
];

const PRODUCT_CONTEXT_PACK_TABLE: DocsTable = {
  title: 'AI 输入包',
  headers: ['输入包', '来源', '关键字段', '缺失时处理'],
  rows: [
    [
      'asset_profile',
      'ads.marketing_content_assets',
      'asset_id、标题、封面、预览、transcript、标签、产品/场景/人群档案、已有 AI 摘要。',
      '缺素材档案时只能做内容初评；必须提示先补素材档案或重新入库。',
    ],
    [
      'material_identity',
      'ads.marketing_content_ad_materials',
      'external_material_id、material_id、objective、delivery_mode、account、active 绑定状态。',
      '多 material_id 未选择时停止正式诊断，要求按实例分别复盘。',
    ],
    [
      'performance_snapshot',
      'dws.marketing_content_qianchuan_material_summary',
      'first_stat_date、last_stat_date、source_table、total_impressions、total_clicks、total_cost、CTR、CVR、GMV/GSV、pay_roi、net_gmv_roi、净成交、结算、refund_rate_1h。',
      '无快照时输出 content_only；不得给预算放量、暂停或 ROI 判断。',
    ],
    [
      'raw_metric_trace',
      'ods.douyin_qianchuan_shortvideo_raw',
      '千川挂车短视频原始素材表现字段、原始口径和刷新批次。',
      '只在需要复核 DWS 汇总或解释异常字段时回看；页面默认以 DWS 汇总为主。',
    ],
    [
      'product_acceptance',
      'ods.douyin_trade_sale_card_detail_raw + 商品页 / 退款结算证据',
      'product_id、stat_date、source_level1、card_exposure_user_count、card_click_user_count、card_click_rate_user、card_buyer_count、card_click_to_pay_rate_user、card_user_pay_amount、card_order_count、加购/收藏、商品标题、价格、评价、库存、履约。',
      'product_id 必须来自素材商品档案、挂车商品解析、商品页证据、短视频明细或人工维护；缺商品承接证据或无法对齐 product_id / 日期窗口时，成交断点只能标为待复核，不能直接归因到素材。',
    ],
  ],
};

const PRODUCT_METRIC_DICTIONARY_TABLE: DocsTable = {
  title: '指标口径与样本门槛',
  headers: ['指标', '来源字段 / 表', '分析用途', '门槛或降级规则'],
  rows: [
    [
      '曝光 / 点击 / 消耗',
      'dws.marketing_content_qianchuan_material_summary；必要时追溯 ods.douyin_qianchuan_shortvideo_raw。',
      '判断样本是否足够、流量是否被投放系统放出、点击成本是否异常。',
      '曝光、点击或消耗不足时只允许 continue_observation，不允许 scale_budget 或 pause_or_reduce_budget。',
    ],
    [
      'CTR / CPC / CPM',
      'DWS 汇总层按千川原始表现计算，source_table=ods.douyin_qianchuan_shortvideo_raw。',
      '判断前 3 秒、封面、标题、口播钩子和定向人群是否有效。',
      'CTR 弱优先定位内容钩子；CPC/CPM 异常需同步看投放计划和定向，不直接判素材差。',
    ],
    [
      'CVR / 商品卡点击',
      'DWS 表现快照 + ods.douyin_trade_sale_card_detail_raw 的 product_id / stat_date / source_level1 承接明细。',
      '判断用户从点击到商品卡、支付的断点在哪里。',
      '点击不弱但支付弱时必须进入 check_product_card；若缺 product_id 或日期窗口，只能标记 missing_card_acceptance。',
    ],
    [
      '商品卡来源层级承接',
      'ods.douyin_trade_sale_card_detail_raw：source_level1、card_exposure_user_count、card_click_user_count、card_click_rate_user、card_buyer_count、card_click_to_pay_rate_user、card_user_pay_amount、card_order_count、card_cart_user_count、card_favorite_user_count。',
      '判断同商品在投放窗口内的商品卡承接环境，识别是商品卡点击弱、点击后支付弱，还是支付金额/订单不足。',
      '只能在 product_day_aligned 或 product_range_aligned 下作为承接证据；禁止把 card_user_pay_amount 直接写成该 material_id 贡献 GMV。',
    ],
    [
      'GMV / GSV / pay_roi',
      'DWS 主表现口径；原始口径来自千川挂车短视频 ODS。',
      '判断支付成交规模和广告消耗效率。',
      '支付 ROI 只能作为候选信号；必须同时通过净成交、结算、退款和毛利保护栏。',
    ],
    [
      'net_gmv / net_gmv_roi / settlement',
      'DWS 汇总层的净成交、结算和成交质量字段。',
      '识别高退款、高退货、未结算或虚高成交素材。',
      '与 pay_roi 冲突时优先进入风险复核，禁止只按支付 ROI 放量。',
    ],
    [
      'refund_rate_1h / refund_loss',
      'DWS 退款风险字段和商品售后证据。',
      '判断短期退款、履约和售后风险是否吞噬毛利。',
      '退款风险高时输出 risk_review 或 check_product_card；没有退款证据时标注待复核。',
    ],
    [
      'benchmark_context',
      '同 objective、同类目、同产品或同素材历史窗口。',
      '决定“高/低/达标”是否有可复核对照。',
      'benchmark 缺失时只能写 fallback，不允许宣称高于行业或同类 benchmark。',
    ],
  ],
};

const PRODUCT_DATA_AVAILABILITY_TABLE: DocsTable = {
  title: '数据可用性与降级策略',
  headers: ['数据状态', '允许输出', '禁止输出'],
  rows: [
    [
      '未确认 asset_id',
      '提示素材身份未确认，要求先从 ads.marketing_content_assets 选择素材。',
      '禁止生成正式 AI 分析、放量、暂停或复剪结论。',
    ],
    [
      '无 material_id 绑定',
      '只做内容初评：钩子、卖点、CTA、商品露出和素材档案建议。',
      '禁止给千川投放表现、ROI、成交或预算动作结论。',
    ],
    [
      '多个 material_id 未确认',
      '展示冲突列表，要求选择实例；可给“需人工核对 material_id”的下一步动作。',
      '禁止自动合并为一个素材表现，也禁止默认拿第一条实例下结论。',
    ],
    [
      '无千川表现快照',
      '输出 content_only 诊断，建议刷新 dws 汇总或补素材绑定。',
      '禁止判断 scale_budget、pause_or_reduce_budget 或 ROI 是否达标。',
    ],
    [
      '曝光/点击/消耗/成交样本不足',
      '输出 insufficient_data 或 continue_observation，列出下一次复查所需样本。',
      '禁止强放量、强暂停、宣称素材优质或宣称商品页承接失败。',
    ],
    [
      'ROI 与结算/退款冲突',
      '进入风险复核：看净成交、结算、退款损失、毛利空间和售后原因。',
      '禁止只因支付 ROI 达标就建议放量。',
    ],
    [
      'benchmark 缺失',
      '标注 benchmark_context=fallback，仅做同素材历史或人工经验对照。',
      '禁止写“高于同 objective benchmark”这类确定性判断。',
    ],
  ],
};

const PRODUCT_DIAGNOSIS_TABLE: DocsTable = {
  title: '诊断维度与必须合并的证据',
  headers: ['诊断问题', '必须看什么', '判断重点'],
  rows: [
    [
      '素材是否能抓住人群',
      '前 3 秒画面、标题、口播、封面、完播/停留信号、CTR。',
      '曝光不差但 CTR 弱时，优先定位钩子、首屏画面、卖点清晰度和人群筛选是否过泛。',
    ],
    [
      '是否能推动商品卡点击',
      'CTA、挂车商品露出、价格锚点、信任背书、点击率和点击成本。',
      '点击弱不是只改出价，要检查商品卡入口是否明确、卖点是否对应商品页面。',
    ],
    [
      '是否能形成有效成交',
      'CVR、GMV/GSV、ROI、净成交、结算、退款和 1 小时退款风险。',
      '不能只看支付 ROI；净 GMV、结算和退款风险会决定素材能否继续放量。',
    ],
    [
      '是否需要复剪或暂停',
      '素材内容证据、千川整体表现、样本门槛、同 objective benchmark。',
      '样本不足只给早期观察；样本足够且成交链路弱，输出复剪、换卖点、调商品卡或暂停。',
    ],
  ],
};

const PRODUCT_CARD_ACCEPTANCE_TABLE: DocsTable = {
  title: '商品卡 / 商品页承接检查项',
  headers: ['检查项', '证据', '影响判断'],
  rows: [
    [
      '卖点一致性',
      '素材前 3 秒、口播主卖点、商品标题、主图和详情页首屏。',
      '素材讲 A、商品页卖 B 时，优先输出 check_product_card 或重剪对齐，不直接判素材差。',
    ],
    [
      '价格与利益点',
      '口播价、屏幕价、券后价、到手价、赠品和活动标签。',
      '点击高但支付弱时，先查价格锚点和利益点是否一致。',
    ],
    [
      '信任背书',
      '评价数、买家秀、差评原因、品牌/功效证明、发货和售后承诺。',
      '素材能带来兴趣但 CVR 弱时，信任不足可能比素材剪辑更关键。',
    ],
    [
      '库存与履约',
      '库存、规格可选、发货时效、售后风险和退款原因。',
      '库存或履约承诺不稳时，不能因为短期 ROI 好就建议继续放量。',
    ],
    [
      '商品角色',
      '引流 SKU、主推 SKU、利润 SKU、组合 SKU、复购 SKU。',
      '素材动作要跟 SKU 角色匹配；引流 SKU 不应用利润 SKU 的单一 ROI 标准判死。',
    ],
  ],
};

const PRODUCT_CARD_ACCEPTANCE_JOIN_TABLE: DocsTable = {
  title: '商品卡承接关联等级',
  headers: ['关联等级', '可用键', '可用结论', '禁止结论'],
  rows: [
    [
      'product_day_aligned',
      '当前千川素材实例能从素材商品档案、挂车商品解析、商品页证据、短视频明细或人工维护中解析到 product_id，并且 shop/account、stat_date 或 first_stat_date-last_stat_date、source_level1 与 ods.douyin_trade_sale_card_detail_raw 对齐。',
      '可写“该商品在当前投放窗口内的商品卡承接表现”，引用 card_click_rate_user、card_click_to_pay_rate_user、card_user_pay_amount、card_order_count 等字段。',
      '仍禁止写“这个 material_id 精确带来商品卡 GMV”；商品卡明细是商品/日期/来源粒度，不是素材实例归因表。',
    ],
    [
      'product_range_aligned',
      '只有 product_id + 投放日期范围可对齐，shop/account 或 source_level1 缺失或较粗。',
      '可作为商品承接背景，辅助判断商品卡点击或点击成交是否拖累转化。',
      '禁止输出单日、单 source_level1 或单 material_id 的精确成交归因。',
    ],
    [
      'account_date_context',
      '只能对齐账号/店铺、日期或来源大类，缺 product_id 或商品映射不可信。',
      '只能写商品卡环境：当日商品卡整体承接强弱、是否需要继续找商品映射。',
      '禁止评价某个商品或某条素材的商品卡成交效率。',
    ],
    [
      'missing_card_acceptance',
      '缺 ods.douyin_trade_sale_card_detail_raw、缺 product_id、缺日期窗口，或 source_level1 无法解释。',
      '只输出千川短视频表现诊断和内容诊断，把商品卡承接标记为 missing。',
      '禁止强行 join；禁止把 DWS 的 pay_roi / net_gmv_roi 当成商品卡承接明细。',
    ],
  ],
};

const PRODUCT_WORKFLOW_STEPS: DocsStep[] = [
  { title: '1. 先确认素材身份', desc: '从 ads.marketing_content_assets 定位 asset_id，再读取素材预览、原片、封面、transcript、标签和素材档案。' },
  { title: '2. 绑定千川实例', desc: '通过 ads.marketing_content_ad_materials.external_material_id 找到当前千川 material_id，并核对 objective。' },
  { title: '3. 拉取表现快照', desc: '读取 dws.marketing_content_qianchuan_material_summary，确认 source_table=ods.douyin_qianchuan_shortvideo_raw。' },
  { title: '4. 尝试补商品卡承接', desc: '先确认 product_id 来源；若素材实例能通过商品档案、挂车商品解析、商品页证据、短视频明细或人工维护拿到 product_id 和日期窗口，再从 ods.douyin_trade_sale_card_detail_raw 按 product_id / stat_date / source_level1 拉取商品卡承接；否则标记 missing_card_acceptance。' },
  { title: '5. 合并内容与数据', desc: '把画面/口播/卖点/CTA 与曝光、点击、消耗、CTR、CVR、成交、ROI、退款和商品卡承接等级同时放进 AI context。' },
  { title: '6. 拆解转化断点', desc: '区分前三秒吸引、商品卡点击、商品页承接、成交转化和退款风险，不把所有问题都归因给素材本身。' },
  { title: '7. 输出动作合同', desc: '给出 scale_budget、make_variant、check_product_card、rewrite_hook 或 pause_or_reduce_budget 等可执行动作。' },
];

const PRODUCT_DECISION_RULE_TABLE: DocsTable = {
  title: '放量 / 观察 / 复剪 / 暂停规则',
  headers: ['动作', '触发条件', '复查窗口与保护栏'],
  rows: [
    [
      'scale_budget',
      '样本达标，CTR、CVR、ROI、净成交、结算和退款风险均优于同 objective benchmark 或稳定高于自身历史。',
      '小步加预算；下一窗口继续看边际 ROI、退款损失、结算率和库存，不允许只按 GMV 放大。',
    ],
    [
      'continue_observation',
      'CTR、点击成本、互动或内容证据有早期信号，但成交样本不足或 benchmark 缺失。',
      '维持小预算或补样本；复查曝光、点击、消耗、成交、退款和商品卡点击，不给强结论。',
    ],
    [
      'make_variant / rewrite_hook',
      '素材有流量或点击潜力，但前 3 秒、价格锚点、信任背书、CTA 或卖点顺序存在明确内容断点。',
      '输出具体复剪点；新版本必须和原 material_id 分开观察，避免把版本效果混在一起。',
    ],
    [
      'check_product_card',
      '点击不弱但支付 CVR、成交质量、结算或退款表现弱，且内容承诺与商品页可能不一致。',
      '商品运营先查主图、标题、价格、券、评价、库存和详情页，再决定是否继续改素材。',
    ],
    [
      'pause_or_reduce_budget',
      '样本达标后 CTR/CVR/ROI/净成交/结算持续不达标，或退款/履约风险吞噬毛利。',
      '暂停原因必须引用指标和内容证据；保留低预算复测条件，避免一刀切删除可复用素材资产。',
    ],
  ],
};

const PRODUCT_PROFIT_GUARDRAIL_TABLE: DocsTable = {
  title: '放量前利润保护栏',
  headers: ['保护栏', '必须补的证据', '决策规则'],
  rows: [
    [
      '可投放毛利空间',
      '商品成本、平台费、履约费、赠品/样品成本、退款损失、目标单均利润。',
      '缺毛利结构时只能判断“投放效率”，不能判断“盈利放量”；放量建议必须标注 economics_missing。',
    ],
    [
      'break-even ROI',
      '可投放毛利率与盈亏平衡 ROI；可用简化口径：break_even_roi = 1 / 可投放毛利率。',
      'pay_roi 高于阈值只是候选信号；net_gmv_roi、结算率、退款损失和毛利空间同时通过后才允许 scale_budget。',
    ],
    [
      '边际 ROI',
      '放量后下一窗口的新增消耗、新增 GMV、新增净 GMV、边际订单成本和退款变化。',
      '预算只能小步增加；边际 ROI 连续走弱或退款损失放大时，优先 cap_budget 或回滚到观察预算。',
    ],
    [
      '价格与渠道风险',
      '素材口播价、商品卡券后价、直播/天猫/私域日常价、活动价和禁破底价。',
      '素材靠低价拉动但破坏价盘时，不输出继续放量；改为拆 SKU、改赠品或调整利益点。',
    ],
    [
      '库存与履约',
      '可售库存、发货时效、售后承诺、差评/退款原因和客服压力。',
      '库存或履约不足时，即使 ROI 达标也只能输出限量投放或暂停扩量，避免付费流量制造售后风险。',
    ],
  ],
};

const PRODUCT_SIGNAL_DECISION_MATRIX_TABLE: DocsTable = {
  title: '常见信号决策矩阵',
  headers: ['信号组合', '优先判断', 'Owner / 动作', '禁止结论'],
  rows: [
    [
      '曝光和消耗达标，CTR 低，CPC/CPM 没有明显异常。',
      '首屏钩子、封面、标题或人群匹配优先级最高；先按内容吸引力问题处理。',
      '短视频负责人改前 3 秒画面、痛点表达、产品露出和标题；投放负责人只做小幅定向/计划复核。',
      '禁止只通过加价、扩预算或换计划解决；不能在无内容改版的情况下继续放量。',
    ],
    [
      'CTR 不弱，但商品卡点击、商品页停留或支付 CVR 弱。',
      '素材能带来兴趣，但需要用 ods.douyin_trade_sale_card_detail_raw 复核同 product_id / 日期窗口下的 card_click_rate_user、card_click_to_pay_rate_user、card_user_pay_amount、card_order_count 是否弱。',
      '商品运营检查 source_level1、主图、券后价、评价、库存和详情首屏；短视频负责人补 CTA、价格利益点和商品露出。',
      '禁止直接写“素材差”或立即暂停；也禁止把商品卡明细支付额写成单 material_id 精确贡献。',
    ],
    [
      'pay_roi 达标，但 net_gmv_roi、结算率、refund_rate_1h 或退款损失不达标。',
      '成交质量不安全，支付 ROI 可能被退款、未结算或履约成本吞噬。',
      '投放负责人 cap_budget；商品/售后负责人复核退款原因、库存履约和价格承诺；下一窗口看净成交和结算。',
      '禁止输出 scale_budget；不能把支付 GMV 当成盈利放量依据。',
    ],
    [
      '点击和成交样本不足，但前 3 秒、评论、收藏或 CTR 有早期信号。',
      '只能判断有早期内容潜力，不能判断成交效率或盈利能力。',
      '投放负责人维持小预算补样本；短视频负责人准备复剪备选版本；下个自然日或补足样本后复查。',
      '禁止强放量、强暂停或宣称“素材优质”。',
    ],
    [
      '同一 asset_id 绑定多个 material_id，且 objective、投放计划或素材版本不同。',
      '素材本体和千川实例粒度不一致，需要按 material_id 分开复盘。',
      '数据/投放负责人选择当前实例，或按 material_id 分别输出诊断；页面展示冲突列表和 source_table。',
      '禁止自动合并表现，也禁止默认拿第一条 material_id 下结论。',
    ],
    [
      'ROI/CVR 短期达标，但库存紧张、价格破底、赠品成本高或售后承诺不可持续。',
      '素材不是唯一决策对象；货盘、价盘和履约会决定能否继续扩量。',
      '商品运营确认库存/价格底线；投放负责人限量放量或维持观察；必要时改利益点而不是继续降价。',
      '禁止用短期 ROI 掩盖价盘、库存或履约风险。',
    ],
  ],
};

const PRODUCT_ACTION_TABLE: DocsTable = {
  title: '输出物与动作合同',
  headers: ['结论类型', '触发信号', '输出要求'],
  rows: [
    [
      '放量',
      '曝光、点击、CVR、ROI、净成交和结算同时达到样本门槛，退款风险可控。',
      '说明放量幅度、预算节奏、观察窗口和必须持续盯住的退款/结算指标。',
    ],
    [
      '观察',
      '样本不足或早期信号只在 CTR、点击成本、互动中出现，成交证据还不稳定。',
      '标记 early_signal_only，给下一次复查所需的曝光、点击、消耗和成交样本门槛。',
    ],
    [
      '复剪',
      '素材有点击或互动潜力，但卖点、价格锚点、信任背书、CTA 或商品页一致性不足。',
      '输出前 3 秒、画面顺序、卖点表达、价格利益点、商品卡对齐和下一版脚本动作。',
    ],
    [
      '暂停或降预算',
      '样本足够后 ROI、CVR、净成交、结算或退款风险持续不达标。',
      '说明暂停理由、不可继续放量的核心证据，以及是否保留素材做低预算再测。',
    ],
  ],
};

const PRODUCT_SAMPLE_OUTPUT_TABLE: DocsTable = {
  title: '标准输出样例',
  headers: ['模块', '样例', '证据要求'],
  rows: [
    [
      '主结论',
      'continue_observation + make_variant：素材钩子有效，但商品卡承接和成交质量尚未证明可放量。',
      '必须同时引用 CTR/点击成本/消耗/成交样本和前 3 秒、口播、CTA、商品露出证据。',
    ],
    [
      '归因',
      '流量兴趣来自痛点钩子；成交断点更可能在价格锚点、评价信任或商品页首屏承接。',
      '引用商品卡点击、支付 CVR、净成交、退款和商品页承接检查项；不能只写“转化差”。',
    ],
    [
      '动作',
      '内容负责人复剪前 3 秒并补价格利益点；商品运营检查主图/券后价/评价；投放负责人维持小预算 24h。',
      '每条 next_actions 要有 owner、action_type、priority、reason、expected_metric_lift、evidence_refs。',
    ],
    [
      '复查',
      '下一个自然日或补足样本后复查 CTR、商品卡点击率、支付 CVR、ROI、净成交、结算和 1 小时退款。',
      '复查窗口未到或样本未满时，只允许维持观察，不允许自动放量。',
    ],
  ],
};

const PRODUCT_AI_SCHEMA_TABLE: DocsTable = {
  title: 'AI v2.1 字段合同',
  headers: ['字段', '挂车成交型要求'],
  rows: [
    ['delivery_mode', '固定为 delivery_mode = qianchuan_all_domain，说明这是千川全域素材数据融合诊断。'],
    ['analysis_schema_version', '固定展示 analysis_schema_version=2.1，便于和素材中台 AI 写回结果对齐。'],
    ['asset_identity', '必须写明素材数据库 ads.marketing_content_assets、asset_id、绑定库 ads.marketing_content_ad_materials、material_id、objective 和 source_table。'],
    ['diagnosis_mode', '标明 data_content_fusion / data_only / content_only / insufficient_data，避免把降级结果写成完整结论。'],
    ['sample_gate', '写清曝光、点击、消耗和成交样本门槛；样本不足时只给 continue_observation 或补样本动作。'],
    ['benchmark_context', '说明同 objective benchmark 的窗口、来源和是否降级为 fallback。'],
    ['decision_case', '引用常见信号决策矩阵中的分支，例如 low_ctr_hook_issue、product_card_break、roi_refund_conflict、multi_material_id_review。'],
    ['product_card_acceptance_attribution', '写明 product_day_aligned / product_range_aligned / account_date_context / missing_card_acceptance；引用 ods.douyin_trade_sale_card_detail_raw 的 stat_date、product_id、source_level1 和关键 card_* 指标。'],
    ['card_source_alignment', '说明商品卡承接是按 product_id / stat_date / source_level1 对齐，还是只能作为账号日期背景；非 product_day_aligned 时禁止单 material_id 商品卡成交贡献。'],
    ['evidence_ledger / metric_evidence / content_evidence', '每条结论要同时引用指标证据和内容证据，例如 CTR、CVR、ROI、净成交、结算、退款与对应画面/口播/CTA。'],
    ['primary_decision', '输出 scale_budget、make_variant、continue_observation、check_product_card 或 pause_or_reduce_budget 等主判断。'],
    ['next_actions', '动作必须包含 owner、action_type、priority、reason、expected_metric_lift 和 evidence_refs。'],
    ['scores', '至少解释 data_performance_score、content_quality_score、conversion_support_score、risk_score、fusion_overall_score 和 confidence。'],
  ],
};

const PRODUCT_REVIEW_SCORE_TABLE: DocsTable = {
  title: '方案自检评分（100 分）',
  headers: ['维度', '分值', '达标标准'],
  rows: [
    [
      '素材身份与数据库标注',
      '15',
      '页面和 AI 输出都明确 ads.marketing_content_assets、asset_id、ads.marketing_content_ad_materials、material_id 与 objective。',
    ],
    [
      '素材表现数据完整度',
      '20',
      '读取 dws.marketing_content_qianchuan_material_summary，并能追溯 ods.douyin_qianchuan_shortvideo_raw；展示 stat_date、source_table、样本门槛和刷新状态。',
    ],
    [
      '内容 + 数据融合诊断',
      '20',
      '把前 3 秒、卖点、CTA、商品露出与曝光、点击、CTR、CVR、消耗、ROI、GMV/GSV 合并解释，不做单边判断。',
    ],
    [
      '成交质量与风险边界',
      '20',
      '同时看净成交、结算、退款、履约和 ods.douyin_trade_sale_card_detail_raw 商品卡承接；禁止只按支付 ROI 建议放量。',
    ],
    [
      '动作可执行性',
      '15',
      '动作落到 scale_budget、make_variant、check_product_card、continue_observation 或 pause_or_reduce_budget，并有 owner、复查窗口和证据引用。',
    ],
    [
      '降级与复核机制',
      '10',
      '样本不足、缺 material_id、缺表现快照或 benchmark 缺失时能降级并进入人工复核，不输出强结论。',
    ],
  ],
};

const PRODUCT_CURRENT_SCORE_TABLE: DocsTable = {
  title: '当前成熟度评分',
  headers: ['评分对象', '当前分', '为什么不是 100 分'],
  rows: [
    [
      '方案设计成熟度',
      '96 / 100',
      '素材身份、material_id、DWS/ODS、商品卡 ODS 承接关联等级、内容 + 数据融合、退款/结算、利润保护栏和常见信号决策矩阵已经成型；剩余差距在真实样本校准、毛利模型自动接入和动态 benchmark。',
    ],
    [
      '可直接指导业务复盘',
      '94 / 100',
      '已经能按 CTR/CVR/ROI/净成交/退款/商品卡承接组合拆 owner 和动作，并能区分 product_day_aligned、product_range_aligned 与 missing_card_acceptance；但如果缺商品成本、库存、退款原因或商品页证据，仍只能给观察/复核动作，不能给强盈利结论。',
    ],
    [
      '可直接作为 runtime 验收合同',
      '89 / 100',
      '字段、降级、动作、证据引用和信号矩阵已明确；还需要后续 runtime 任务把 sample_gate、benchmark_context、profit_guardrail、decision_case 和 evidence_refs 真正写入 AI 结果。',
    ],
  ],
};

const PRODUCT_OPTIMIZATION_BACKLOG_TABLE: DocsTable = {
  title: '后续优化优先级',
  headers: ['优先级', '优化项', '验收标准'],
  rows: [
    [
      'P0',
      '把毛利、退款损失、库存和价格底线接进 analysis context。',
      'AI 输出中能区分 pay_roi 达标但毛利/退款不达标的素材，并自动阻止 scale_budget。',
    ],
    [
      'P0',
      '沉淀同 objective + 同账号/同产品的动态 benchmark。',
      '没有 benchmark 时明确 fallback；有 benchmark 时所有“高/低/达标”都能引用窗口和样本量。',
    ],
    [
      'P1',
      '把商品卡/商品页承接证据结构化。',
      '点击强成交弱时，AI 能引用 ods.douyin_trade_sale_card_detail_raw 的 product_id、stat_date、source_level1 和 card_* 指标，在素材、商品卡主图、价格、评价、库存、履约之间拆分责任。',
    ],
    [
      'P1',
      '为复剪版本建立 parent_asset_id / variant lineage 复盘视角。',
      '原素材和复剪素材能分开看 material_id 表现，同时保留同一创意族的效果对比。',
    ],
    [
      'P2',
      '把人工采纳结果回写成评估集。',
      'scale、pause、make_variant 等动作能按 7/14 天后结果回查采纳率和误判原因。',
    ],
  ],
};

const PRODUCT_DATA_READINESS_TABLE: DocsTable = {
  title: '上线前数据验收探针',
  headers: ['探针', '通过条件', '失败时处理'],
  rows: [
    [
      '素材库身份',
      'asset_id 可在 ads.marketing_content_assets 命中，且标题、预览、封面、transcript 或素材档案至少有一类可读。',
      '回到素材库补档案或重新入库；AI 只允许输出素材身份缺失提示。',
    ],
    [
      '千川实例绑定',
      'ads.marketing_content_ad_materials 存在 active qianchuan 绑定，external_material_id 非空且等于千川 material_id。',
      '提示补千川素材 ID；多个 active material_id 时必须让用户选择实例。',
    ],
    [
      'objective 对齐',
      'dws.marketing_content_qianchuan_material_summary 的 objective=product_all_domain_shortvideo，source_table 指向 ods.douyin_qianchuan_shortvideo_raw。',
      '不允许套用直播引流方案；展示 objective 冲突并进入人工复核。',
    ],
    [
      '表现样本',
      '曝光、点击、消耗、CTR、CVR、GMV/GSV、ROI、净成交、结算或退款字段达到最小可解释样本。',
      '降级为 insufficient_data 或 continue_observation，只给补样本动作。',
    ],
    [
      '成交质量',
      '支付 ROI 与净成交、结算、退款风险、履约或商品承接证据不冲突。',
      '进入 check_product_card / risk_review，不允许直接 scale_budget。',
    ],
    [
      '商品卡承接关联',
      '若要输出商品卡承接结论，必须命中 ods.douyin_trade_sale_card_detail_raw，并至少说明 product_card_acceptance_attribution 等级、product_id、stat_date 或投放日期窗口、source_level1。',
      '缺 product_id、日期窗口或来源层级时标记 missing_card_acceptance，只输出千川表现和内容诊断。',
    ],
  ],
};

const PRODUCT_ANTI_PATTERN_TABLE: DocsTable = {
  title: '禁止输出与改写规则',
  headers: ['禁止写法', '为什么错', '应改成'],
  rows: [
    [
      '“视频内容不错，建议直接加预算。”',
      '只看素材本身，没有结合千川表现、样本门槛、成交质量和商品承接。',
      '“当前仅有内容初评；缺 material_id 或表现快照，不能给放量判断。先补绑定/刷新 DWS。”',
    ],
    [
      '“ROI 达标，所以可以继续放大。”',
      '忽略净成交、结算、退款、履约和库存，容易把高退款素材误判为优质。',
      '“ROI 达标但需同时复核 net_gmv_roi、settlement、refund_rate_1h 和库存/履约后再小步放量。”',
    ],
    [
      '“转化差，素材差。”',
      '成交断点可能在商品卡、价格、评价、库存或详情页承接，不一定是素材问题。',
      '“CTR/点击不弱但支付 CVR 弱，先派 check_product_card，同时给复剪价格锚点或信任背书动作。”',
    ],
    [
      '“这个 material_id 带来了商品卡 GMV xx 元。”',
      'ods.douyin_trade_sale_card_detail_raw 是 shop_id + stat_date + product_id + source_level1 粒度，不是 material_id 级归因表。',
      '“该商品在素材投放窗口内商品卡承接表现为 xx；当前只能作为 product_day_aligned 承接背景，不能写成单素材精确贡献。”',
    ],
    [
      '“多个 material_id 合并看整体表现。”',
      'material_id 是千川素材实例；多实例混合会掩盖计划、objective、素材版本和投放环境差异。',
      '“按 material_id 分别复盘；未选择实例前只展示冲突列表和人工核对动作。”',
    ],
  ],
};

const PRODUCT_BOUNDARY_ROWS: DocsRow[] = [
  { label: '素材不是孤立视频', value: '正式诊断必须标明素材所在数据库 ads.marketing_content_assets，并结合素材档案、千川实例和表现快照。' },
  { label: 'material_id 粒度', value: '千川 material_id 是广告素材实例，不等同于 asset_id；一个素材可有多个实例，页面要展示当前实例和 objective。' },
  { label: '投放口径', value: 'boost_* / legacy_boost_* 只解释追投或调控行为，不能并入 overall_* 主表现口径。' },
  { label: '商品卡承接来源', value: '挂车短视频表现来自 ods.douyin_qianchuan_shortvideo_raw；商品卡承接另来自 ods.douyin_trade_sale_card_detail_raw。两者不是 material_id 直连，必须先拿到 product_id，再按 stat_date / source_level1 作为承接上下文关联。' },
  { label: '商品卡归因边界', value: '除非有额外可验证的素材到商品点击链路，商品卡明细只能说明该商品在投放窗口内的承接表现，不能写成单 material_id 精确成交归因。' },
  { label: '成交判断', value: '挂车成交型不能只看支付 ROI，还要同时看 CTR、CVR、GMV/GSV、净成交、结算和 1 小时退款风险。' },
  { label: '证据不足', value: '曝光、点击或消耗不足时，只输出观察和补样本动作，不给强放量或强暂停结论。' },
  { label: '实现边界', value: '本页只沉淀方案与后续验收合同，不代表当前 AI job 已经按全部 v2.1 字段自动产出；runtime 接入需另行实现和验收。' },
];

export const DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PAGE: DocsPageModel = {
  key: 'analysis-plans',
  path: DOUYIN_QIANCHUAN_PRODUCT_SHORTVIDEO_AI_ANALYSIS_PATH,
  eyebrow: 'Analysis Plan',
  title: '千川挂车带货短视频 AI 分析',
  subtitle: '面向商品卡 / 挂车成交素材，把素材视频、素材数据库、千川素材表现和商品承接证据合并诊断，输出可执行的放量、复剪、观察或暂停动作。',
  primaryAction: {
    href: ROUTE_PATHS.docsAnalysisPlans,
    label: '返回方案库',
  },
  sections: [
    {
      id: 'plan-positioning',
      title: '方案定位',
      paragraphs: [
        '这套方案不把 AI 分析理解成“看一遍视频然后写评价”。它先确认素材来自哪个素材数据库、绑定了哪个千川 material_id，再把素材内容和千川表现合并成同一条诊断链。',
      ],
      rows: [
        { label: '核心目标', value: 'objective=product_all_domain_shortvideo，判断短视频是否能直接推动商品卡 / 挂车点击和成交。' },
        { label: '主要问题', value: '这条素材应该放量、观察、复剪、换卖点、调商品卡，还是暂停降预算？' },
        { label: '分析输入', value: '素材本身、素材档案、广告素材实例、千川表现、商品卡承接和退款/结算风险。' },
        { label: '业务输出', value: '明确问题发生在钩子、卖点、价格信任、CTA、商品卡承接还是成交质量。' },
      ],
    },
    {
      id: 'execution-summary',
      title: '先读结论',
      lead: '业务先按这 5 条判断能不能进入正式分析；不能满足前置条件时，AI 必须降级。',
      rows: PRODUCT_EXECUTION_SUMMARY_ROWS,
    },
    {
      id: 'data-sources',
      title: '素材数据库与数据源',
      lead: '页面和 AI 结果都要把素材所在数据库标明；千川挂车表现与商品卡承接是两条 ODS 来源，能关联，但不是 material_id 直连，必须先取得 product_id，再写清日期窗口、source_level1 和可信等级。',
      tables: [
        PRODUCT_DATA_SOURCE_TABLE,
        PRODUCT_DISPLAY_CONTRACT_TABLE,
        PRODUCT_CARD_ACCEPTANCE_LINK_TABLE,
        PRODUCT_CONTEXT_PACK_TABLE,
        PRODUCT_METRIC_DICTIONARY_TABLE,
        PRODUCT_DATA_AVAILABILITY_TABLE,
      ],
    },
    {
      id: 'analysis-workflow',
      title: '执行路径',
      lead: '先做身份和数据对齐，再让 AI 合并内容证据与素材表现，最后输出动作。',
      steps: PRODUCT_WORKFLOW_STEPS,
      tables: [PRODUCT_DIAGNOSIS_TABLE, PRODUCT_CARD_ACCEPTANCE_TABLE, PRODUCT_CARD_ACCEPTANCE_JOIN_TABLE],
    },
    {
      id: 'output-contract',
      title: '输出物与动作合同',
      lead: '每个结论都要能落到预算、复剪、商品卡或观察窗口，不能停留在“素材不错/一般”。',
      tables: [
        PRODUCT_AI_SCHEMA_TABLE,
        PRODUCT_PROFIT_GUARDRAIL_TABLE,
        PRODUCT_SIGNAL_DECISION_MATRIX_TABLE,
        PRODUCT_DECISION_RULE_TABLE,
        PRODUCT_ACTION_TABLE,
        PRODUCT_SAMPLE_OUTPUT_TABLE,
        PRODUCT_DATA_READINESS_TABLE,
        PRODUCT_ANTI_PATTERN_TABLE,
        PRODUCT_REVIEW_SCORE_TABLE,
      ],
    },
    {
      id: 'maturity-score',
      title: '当前评分与后续优化',
      lead: '当前评分只评价方案设计和验收合同，不代表 AI runtime 已经自动产出全部 v2.1 字段。',
      tables: [PRODUCT_CURRENT_SCORE_TABLE, PRODUCT_OPTIMIZATION_BACKLOG_TABLE],
    },
    {
      id: 'attribution-boundary',
      title: '归因边界与复核',
      lead: '挂车短视频的重点是单素材实例的成交效率，但商品卡承接不是 material_id 级事实表，必须保留样本门槛、product_id 对齐等级和退款/结算边界。',
      rows: PRODUCT_BOUNDARY_ROWS,
    },
  ],
};
