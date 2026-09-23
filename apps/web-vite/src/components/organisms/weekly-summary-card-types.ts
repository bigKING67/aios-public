import type {
  SummaryProvider,
  WeeklySummaryAIScope,
} from '@/config/weekly-summary-ai';

export interface WeeklySummaryCardProps {
  reportId: string;
  weekPeriod?: string;
  summaryLabel?: string;
  summaryScope?: WeeklySummaryAIScope;
}

export interface SummaryAIConfigDraft {
  provider: SummaryProvider;
  model: string;
  businessFramework: string;
  customPrompt: string;
  factsJsonText: string;
}

export interface FactsBuilderDraft {
  campaignsText: string;
  promotionsText: string;
  budgetChangesText: string;
  inventoryNotesText: string;
  marketSignalsText: string;
  otherNotesText: string;
}
