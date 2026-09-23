export type SummaryProvider = 'deepseek' | 'kimi';
export type WeeklySummaryAIScope = 'global' | 'overview' | 'tmall';

export interface WeeklySummaryAIConfig {
  provider?: SummaryProvider;
  model?: string;
  businessFramework?: string;
  customPrompt?: string;
  factsData?: Record<string, unknown>;
}

const WEEKLY_SUMMARY_AI_STORAGE_KEY = 'groland.weekly.summary.ai.config';
const WEEKLY_SUMMARY_AI_SCOPE_STORAGE_PREFIX = `${WEEKLY_SUMMARY_AI_STORAGE_KEY}.scope`;
const WEEKLY_SUMMARY_REFERENCE_DOCS = {
  tmallDiagnosis: 'docs/tmall_channel_diagnosis_v2.md',
  douyinDiagnosis: 'docs/douyin_channel_diagnosis_correct.md',
  attributionGuide: 'docs/REPORTS_CHANNEL_ATTRIBUTION_ACTION_GUIDE_2026-03-04.md',
} as const;

/**
 * 周报 AI 总结统一配置
 *
 * 使用方式：
 * 1. `businessFramework`：写你的分析框架（例如增长、渠道、复购、风险）
 * 2. `customPrompt`：写你希望模型必须遵循的额外提示词
 * 3. `factsData`：写额外背景信息（品牌策略、投放节奏、活动计划等）
 * 4. `provider/model`：控制模型路由，默认优先 DeepSeek
 */
export const WEEKLY_SUMMARY_AI_CONFIG: WeeklySummaryAIConfig = {
  provider: 'deepseek',
  model: 'deepseek-reasoner',
  businessFramework: '围绕 GMV、订单、用户、平台贡献、风险与下周动作给出“量级+幅度+动作”并存的可执行结论',
  customPrompt: '',
  factsData: {},
};

const WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS: Record<WeeklySummaryAIScope, WeeklySummaryAIConfig> = {
  global: WEEKLY_SUMMARY_AI_CONFIG,
  overview: {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    businessFramework:
      '采用金字塔结构，先给总体经营结论，再给核心指标与平台贡献证据，最后给下周动作与风险预警。',
    customPrompt:
      '请按“结论先行”输出：1) 总体结论（不超过120字）；2) 关键亮点（3条）；3) 主要风险（2条）；4) 下周动作（3条，动作可执行、责任清晰）。每条亮点/风险必须写“量级+幅度+动作”：量级写绝对值（金额/人数/订单），幅度写环比或变化率，动作写落地动作（投放、人群、素材、出价、承接页、活动节奏等）。不要只写涨跌百分比。语言简洁，避免空话。必须严格基于输入事实，不得编造数字或占位词（如平台A）。',
    factsData: {
      summary_scope: 'overview',
      focus_modules: ['核心指标', '周趋势', 'by周趋势', '平台贡献与增量拆解'],
      writing_style: ['金字塔结构', '结论先行', '条理清晰'],
      reference_docs: Object.values(WEEKLY_SUMMARY_REFERENCE_DOCS),
      attribution_execution_baseline: {
        decomposition_order: ['结果层', '渠道层', '漏斗因子层', '动作层'],
        evidence_requirements: ['量级', '幅度', '机制', '动作'],
        action_sla: {
          p0: '0-24h 止损动作',
          p1: '1-7天 结构优化',
          p2: '7-30天 机制建设',
        },
      },
      method_boundaries: {
        shapley_usage: '用于贡献解释，不直接等价因果结论',
        validation_requirement: '关键策略建议需结合实验或业务复核',
      },
      external_evidence: {
        alimama_official: 'https://www.alimama.com/',
        douyin_learning_center:
          'https://school.jinritemai.com/doudian/web/course-series/cJRy5tAmL5RU',
        google_adh_shapley: 'https://developers.google.com/ads-data-hub/guides/shapley',
        shapley_paper: 'https://arxiv.org/abs/1804.05327',
      },
    },
  },
  tmall: {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    businessFramework:
      '采用金字塔结构，先给天猫经营结论，再按“商品定位→渠道定位→渠道漏斗→量化归因（Shapley）”展开证据，最后给优先级动作。',
    customPrompt:
      '请围绕天猫页数据输出：1) 经营总判断；2) 商品与渠道核心驱动；3) 漏斗关键损耗节点；4) 量化归因与动作清单（P0/P1/P2）。每条亮点/风险必须写“量级+幅度+动作”：量级写绝对值（支付金额/访客数/加购人数/支付人数），幅度写环比或变化率，动作落到投放、人群、素材、出价、承接页、活动节奏或货品策略。不要只写涨跌百分比。必须严格基于输入事实，不得编造数字或占位词（如平台A）。',
    factsData: {
      summary_scope: 'tmall',
      platform: '天猫',
      focus_modules: ['商品定位', '流量渠道定位', '流量行为漏斗', '量化归因'],
      writing_style: ['金字塔结构', '结论先行', '条理清晰'],
      reference_docs: Object.values(WEEKLY_SUMMARY_REFERENCE_DOCS),
      tmall_channel_diagnosis_rules: {
        channels: ['搜索', '推荐', '关键词推广', '人群推广'],
        decomposition_formula: '渠道GMV = 展现人数 x 点击率(CTR) x 成交率(CVR)',
        action_priority_template: ['P0 24h止损', 'P1 1-7天优化', 'P2 7-30天机制化'],
      },
      cross_platform_seed_hint: {
        note: '跨平台种草影响天猫搜索热度存在时滞，动作建议需给出观察窗口',
        observe_window: '建议4-6周',
      },
      method_boundaries: {
        shapley_usage: '用于归因解释，不直接作为因果证明',
        validation_requirement: '高成本动作需结合业务实验或A/B结果复核',
      },
    },
  },
};

function normalizeSummaryScope(scope?: string): WeeklySummaryAIScope {
  if (scope === 'overview' || scope === 'tmall' || scope === 'global') {
    return scope;
  }
  return 'global';
}

function resolveSummaryStorageKey(scope: WeeklySummaryAIScope): string {
  if (scope === 'global') {
    return WEEKLY_SUMMARY_AI_STORAGE_KEY;
  }
  return `${WEEKLY_SUMMARY_AI_SCOPE_STORAGE_PREFIX}.${scope}`;
}

function readSummaryConfigFromStorage(storageKey: string): WeeklySummaryAIConfig | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    return sanitizeSummaryConfig(JSON.parse(raw) as WeeklySummaryAIConfig);
  } catch {
    return undefined;
  }
}

function normalizeSummaryProvider(value?: string): SummaryProvider | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'deepseek' || normalized === 'kimi') {
    return normalized as SummaryProvider;
  }

  return undefined;
}

function sanitizeSummaryConfig(raw?: WeeklySummaryAIConfig | null): WeeklySummaryAIConfig {
  const provider = normalizeSummaryProvider(raw?.provider);
  const model = typeof raw?.model === 'string' ? raw.model.trim() : '';
  const businessFramework =
    typeof raw?.businessFramework === 'string' ? raw.businessFramework.trim() : '';
  const customPrompt = typeof raw?.customPrompt === 'string' ? raw.customPrompt.trim() : '';
  const factsData =
    raw?.factsData && typeof raw.factsData === 'object' && !Array.isArray(raw.factsData)
      ? raw.factsData
      : {};

  return {
    provider,
    model,
    businessFramework,
    customPrompt,
    factsData,
  };
}

export function getWeeklySummaryAIConfig(scope?: WeeklySummaryAIScope): WeeklySummaryAIConfig {
  const normalizedScope = normalizeSummaryScope(scope);
  const baseConfig = sanitizeSummaryConfig(
    WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS[normalizedScope] || WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS.global
  );

  if (typeof window === 'undefined') {
    return baseConfig;
  }

  const scopedStorageConfig = readSummaryConfigFromStorage(resolveSummaryStorageKey(normalizedScope));
  if (scopedStorageConfig) {
    return {
      ...baseConfig,
      ...scopedStorageConfig,
    };
  }

  if (normalizedScope !== 'global') {
    const legacyGlobalConfig = readSummaryConfigFromStorage(WEEKLY_SUMMARY_AI_STORAGE_KEY);
    if (legacyGlobalConfig) {
      return {
        ...baseConfig,
        ...legacyGlobalConfig,
      };
    }
  }

  return baseConfig;
}

export function hasWeeklySummaryAIConfigOverride(scope?: WeeklySummaryAIScope): boolean {
  const normalizedScope = normalizeSummaryScope(scope);
  if (typeof window === 'undefined') {
    return false;
  }

  const scopedKey = resolveSummaryStorageKey(normalizedScope);
  if (window.localStorage.getItem(scopedKey)) {
    return true;
  }

  // 兼容历史：非 global scope 可能复用过旧 global key
  if (normalizedScope !== 'global') {
    return Boolean(window.localStorage.getItem(WEEKLY_SUMMARY_AI_STORAGE_KEY));
  }

  return false;
}

export function resetWeeklySummaryAIConfig(scope?: WeeklySummaryAIScope): WeeklySummaryAIConfig {
  const normalizedScope = normalizeSummaryScope(scope);
  const baseConfig = sanitizeSummaryConfig(
    WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS[normalizedScope] || WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS.global
  );

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(resolveSummaryStorageKey(normalizedScope));
  }

  return baseConfig;
}

export function saveWeeklySummaryAIConfig(
  next: WeeklySummaryAIConfig,
  scope?: WeeklySummaryAIScope
): WeeklySummaryAIConfig {
  const normalizedScope = normalizeSummaryScope(scope);
  const merged = {
    ...sanitizeSummaryConfig(
      WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS[normalizedScope] || WEEKLY_SUMMARY_AI_SCOPE_DEFAULTS.global
    ),
    ...sanitizeSummaryConfig(next),
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(resolveSummaryStorageKey(normalizedScope), JSON.stringify(merged));
  }

  return merged;
}
