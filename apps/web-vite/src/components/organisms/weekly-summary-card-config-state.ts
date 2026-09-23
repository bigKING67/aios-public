'use client';

import { useState } from 'react';
import { App } from 'antd';
import {
  hasWeeklySummaryAIConfigOverride,
  resetWeeklySummaryAIConfig,
  saveWeeklySummaryAIConfig,
  type WeeklySummaryAIScope,
} from '@/config/weekly-summary-ai';
import { asRecord } from '@/lib/unknown-data';
import {
  DEFAULT_FACTS_JSON_TEXT,
  createAIDraftFromConfig,
  createFactsBuilderFromFactsObject,
  createFactsBuilderFromJsonText,
  normalizeLines,
  safeParseFactsObject,
} from './weekly-summary-card-model';
import type { WeeklySummaryConfigModalProps } from './weekly-summary-config-modal';
import type {
  FactsBuilderDraft,
  SummaryAIConfigDraft,
} from './weekly-summary-card-types';

export interface UseWeeklySummaryCardConfigStateArgs {
  summaryScope: WeeklySummaryAIScope;
  confirmLoading: boolean;
}

export function useWeeklySummaryCardConfigState({
  summaryScope,
  confirmLoading,
}: UseWeeklySummaryCardConfigStateArgs) {
  const { notification, modal } = App.useApp();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<SummaryAIConfigDraft>(() =>
    createAIDraftFromConfig(summaryScope)
  );
  const [factsBuilderDraft, setFactsBuilderDraft] = useState<FactsBuilderDraft>(() =>
    createFactsBuilderFromJsonText(createAIDraftFromConfig(summaryScope).factsJsonText)
  );
  const [configErrorText, setConfigErrorText] = useState<string | null>(null);
  const [hasConfigOverride, setHasConfigOverride] = useState<boolean>(() =>
    hasWeeklySummaryAIConfigOverride(summaryScope)
  );

  const openConfigModal = () => {
    const nextDraft = createAIDraftFromConfig(summaryScope);
    setConfigDraft(nextDraft);
    setFactsBuilderDraft(createFactsBuilderFromJsonText(nextDraft.factsJsonText));
    setHasConfigOverride(hasWeeklySummaryAIConfigOverride(summaryScope));
    setConfigErrorText(null);
    setIsConfigModalOpen(true);
  };

  const handleSaveConfig = () => {
    const provider = configDraft.provider;
    const model = configDraft.model.trim();
    const businessFramework = configDraft.businessFramework.trim();
    const customPrompt = configDraft.customPrompt.trim();

    if (!model) {
      setConfigErrorText('模型名称不能为空');
      return;
    }
    if (!businessFramework) {
      setConfigErrorText('业务分析框架不能为空');
      return;
    }

    let parsedFacts: Record<string, unknown> = {};
    const factsJsonText = configDraft.factsJsonText.trim();
    if (factsJsonText) {
      try {
        const parsed = JSON.parse(factsJsonText);
        const factsRecord = asRecord(parsed);
        if (!factsRecord) {
          setConfigErrorText('背景信息必须是 JSON 对象，例如 {"campaign":"618预热"}');
          return;
        }
        parsedFacts = factsRecord;
      } catch {
        setConfigErrorText('背景信息 JSON 格式不合法');
        return;
      }
    }

    modal.confirm({
      title: '确认保存 AI 配置？',
      content: '保存后，后续生成总结会使用这套配置与背景信息。',
      okText: '确认保存',
      cancelText: '取消',
      onOk: () => {
        saveWeeklySummaryAIConfig({
          provider,
          model,
          businessFramework,
          customPrompt,
          factsData: parsedFacts,
        }, summaryScope);

        setIsConfigModalOpen(false);
        setHasConfigOverride(true);
        setConfigErrorText(null);
        notification.success({
          title: 'AI 配置已保存',
          description: '后续点击“生成本周总结”将使用最新配置。',
        });
      },
    });
  };

  const handleApplyFactsBuilderToJson = () => {
    const parsed = safeParseFactsObject(configDraft.factsJsonText);
    if (!parsed) {
      setConfigErrorText('当前 JSON 不合法，请先修复 JSON，再使用可视化填写功能。');
      return;
    }

    const nextFacts: Record<string, unknown> = { ...parsed };
    nextFacts.external_business_context = {
      campaigns: normalizeLines(factsBuilderDraft.campaignsText),
      promotions: normalizeLines(factsBuilderDraft.promotionsText),
      budget_changes: normalizeLines(factsBuilderDraft.budgetChangesText),
      inventory_notes: normalizeLines(factsBuilderDraft.inventoryNotesText),
      market_signals: normalizeLines(factsBuilderDraft.marketSignalsText),
      other_notes: normalizeLines(factsBuilderDraft.otherNotesText),
    };

    setConfigDraft((prev) => ({
      ...prev,
      factsJsonText: JSON.stringify(nextFacts, null, 2),
    }));
    setConfigErrorText(null);
    notification.success({
      title: '已写入 JSON',
      description: '可视化填写内容已转换并写入背景信息 JSON。',
    });
  };

  const handleSyncFactsBuilderFromJson = () => {
    const parsed = safeParseFactsObject(configDraft.factsJsonText);
    if (!parsed) {
      setConfigErrorText('当前 JSON 不合法，无法回填可视化表单。');
      return;
    }
    setFactsBuilderDraft(createFactsBuilderFromFactsObject(parsed));
    setConfigErrorText(null);
    notification.success({
      title: '已回填表单',
      description: '已从背景信息 JSON 同步到可视化填写区。',
    });
  };

  const handleResetConfigToDefault = () => {
    modal.confirm({
      title: '恢复推荐配置？',
      content: '会清空当前 scope 的本地覆盖配置，并恢复为代码内推荐默认值。',
      okText: '恢复默认',
      cancelText: '取消',
      onOk: () => {
        const resetConfig = resetWeeklySummaryAIConfig(summaryScope);
        const provider = resetConfig.provider === 'kimi' ? 'kimi' : 'deepseek';
        const model =
          typeof resetConfig.model === 'string' && resetConfig.model.trim()
            ? resetConfig.model.trim()
            : provider === 'kimi'
              ? 'kimi-k2.5'
              : 'deepseek-reasoner';
        const factsJsonText =
          JSON.stringify(resetConfig.factsData || {}, null, 2) || DEFAULT_FACTS_JSON_TEXT;

        setConfigDraft({
          provider,
          model,
          businessFramework: resetConfig.businessFramework || '',
          customPrompt: resetConfig.customPrompt || '',
          factsJsonText,
        });
        setFactsBuilderDraft(createFactsBuilderFromJsonText(factsJsonText));
        setHasConfigOverride(false);
        setConfigErrorText(null);
        notification.success({
          title: '已恢复推荐配置',
          description: '本地覆盖配置已清除，当前显示为默认配置。',
        });
      },
    });
  };

  const configModalProps: WeeklySummaryConfigModalProps = {
    open: isConfigModalOpen,
    confirmLoading,
    hasConfigOverride,
    configDraft,
    factsBuilderDraft,
    errorText: configErrorText,
    onCancel: () => setIsConfigModalOpen(false),
    onSave: handleSaveConfig,
    onResetConfigToDefault: handleResetConfigToDefault,
    setConfigDraft,
    setFactsBuilderDraft,
    onApplyFactsBuilderToJson: handleApplyFactsBuilderToJson,
    onSyncFactsBuilderFromJson: handleSyncFactsBuilderFromJson,
  };

  return {
    openConfigModal,
    configModalProps,
  };
}
