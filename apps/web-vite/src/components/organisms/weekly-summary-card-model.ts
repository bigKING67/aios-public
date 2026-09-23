import type { SummaryContentStatus } from '@/hooks/use-weekly-summary';
import {
  getWeeklySummaryAIConfig,
  type WeeklySummaryAIScope,
} from '@/config/weekly-summary-ai';
import { asRecord } from '@/lib/unknown-data';
import type {
  FactsBuilderDraft,
  SummaryAIConfigDraft,
} from './weekly-summary-card-types';

export const DEFAULT_FACTS_JSON_TEXT = '{}';

export const EMPTY_FACTS_BUILDER: FactsBuilderDraft = {
  campaignsText: '',
  promotionsText: '',
  budgetChangesText: '',
  inventoryNotesText: '',
  marketSignalsText: '',
  otherNotesText: '',
};

export const CONTENT_STATUS_META: Record<
  SummaryContentStatus,
  { label: string; color: 'blue' | 'cyan' | 'gold' | 'green' }
> = {
  AI_DRAFT: { label: 'AI草稿', color: 'blue' },
  MANUAL_EDITED: { label: '人工修订', color: 'cyan' },
  APPROVED: { label: '审核通过', color: 'gold' },
  PUBLISHED: { label: '已发布', color: 'green' },
};

export function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function createAIDraftFromConfig(
  summaryScope: WeeklySummaryAIScope
): SummaryAIConfigDraft {
  const config = getWeeklySummaryAIConfig(summaryScope);
  const provider = config.provider === 'kimi' ? 'kimi' : 'deepseek';
  const model =
    typeof config.model === 'string' && config.model.trim()
      ? config.model.trim()
      : provider === 'kimi'
        ? 'kimi-k2.5'
        : 'deepseek-reasoner';

  return {
    provider,
    model,
    businessFramework: config.businessFramework || '',
    customPrompt: config.customPrompt || '',
    factsJsonText: JSON.stringify(config.factsData || {}, null, 2) || DEFAULT_FACTS_JSON_TEXT,
  };
}

export function safeParseFactsObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function toLinesText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
      .join('\n');
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
}

export function createFactsBuilderFromFactsObject(
  facts: Record<string, unknown>
): FactsBuilderDraft {
  const externalContextRaw = facts.external_business_context;
  const externalContext = asRecord(externalContextRaw) ?? {};

  return {
    campaignsText: toLinesText(externalContext.campaigns),
    promotionsText: toLinesText(externalContext.promotions),
    budgetChangesText: toLinesText(externalContext.budget_changes),
    inventoryNotesText: toLinesText(externalContext.inventory_notes),
    marketSignalsText: toLinesText(externalContext.market_signals),
    otherNotesText: toLinesText(externalContext.other_notes),
  };
}

export function createFactsBuilderFromJsonText(text: string): FactsBuilderDraft {
  const parsed = safeParseFactsObject(text);
  if (!parsed) {
    return { ...EMPTY_FACTS_BUILDER };
  }
  return createFactsBuilderFromFactsObject(parsed);
}
