'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Alert, Button, Input, Modal, Select, Space } from 'antd';
import type { SummaryProvider } from '@/config/weekly-summary-ai';
import type {
  FactsBuilderDraft,
  SummaryAIConfigDraft,
} from './weekly-summary-card-types';
import styles from './weekly-summary-card-modern.module.css';

export interface WeeklySummaryConfigModalProps {
  open: boolean;
  confirmLoading: boolean;
  hasConfigOverride: boolean;
  configDraft: SummaryAIConfigDraft;
  factsBuilderDraft: FactsBuilderDraft;
  errorText: string | null;
  onCancel: () => void;
  onSave: () => void;
  onResetConfigToDefault: () => void;
  setConfigDraft: Dispatch<SetStateAction<SummaryAIConfigDraft>>;
  setFactsBuilderDraft: Dispatch<SetStateAction<FactsBuilderDraft>>;
  onApplyFactsBuilderToJson: () => void;
  onSyncFactsBuilderFromJson: () => void;
}

export function WeeklySummaryConfigModal({
  open,
  confirmLoading,
  hasConfigOverride,
  configDraft,
  factsBuilderDraft,
  errorText,
  onCancel,
  onSave,
  onResetConfigToDefault,
  setConfigDraft,
  setFactsBuilderDraft,
  onApplyFactsBuilderToJson,
  onSyncFactsBuilderFromJson,
}: WeeklySummaryConfigModalProps) {
  return (
    <Modal
      title="AI 总结配置"
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      confirmLoading={confirmLoading}
      okText="保存配置"
      cancelText="取消"
    >
      <div className={styles.configModalStack}>
        {hasConfigOverride ? (
          <Alert
            type="info"
            showIcon
            title="检测到本地覆盖配置"
            description="你之前保存过 AI 配置，本地配置会覆盖代码默认值。若要回到推荐值，请点击“恢复推荐配置”。"
            action={
              <Button size="small" onClick={onResetConfigToDefault}>
                恢复推荐配置
              </Button>
            }
          />
        ) : null}
        <div className={styles.configFieldBlock}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>模型供应商</div>
            <div className={styles.configFieldRequired}>
              <span className={styles.configFieldRequiredAsterisk}>*</span>必填
            </div>
          </div>
          <Select
            value={configDraft.provider}
            options={[
              { value: 'deepseek', label: 'DeepSeek（推荐）' },
              { value: 'kimi', label: 'Kimi' },
            ]}
            onChange={(value) => {
              const provider = value as SummaryProvider;
              setConfigDraft((prev) => ({
                ...prev,
                provider,
                model:
                  provider === prev.provider
                    ? prev.model
                    : provider === 'deepseek'
                      ? 'deepseek-reasoner'
                      : 'kimi-k2.5',
              }));
            }}
            className={styles.fullWidthControl}
          />
          <div className={styles.configFieldHint}>
            用法：选择调用哪家模型服务。通常推荐 `DeepSeek`，如遇稳定性问题可切换 `Kimi`。
          </div>
        </div>
        <div className={styles.configFieldBlock}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>模型名称</div>
            <div className={styles.configFieldRequired}>
              <span className={styles.configFieldRequiredAsterisk}>*</span>必填
            </div>
          </div>
          <Input
            value={configDraft.model}
            onChange={(event) =>
              setConfigDraft((prev) => ({ ...prev, model: event.target.value }))
            }
            placeholder="例如 deepseek-reasoner"
          />
          <div className={styles.configFieldHint}>
            用法：填写具体模型 ID。建议先用默认值，只有切模型版本时再改。
          </div>
        </div>
        <div className={styles.configFieldBlock}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>业务分析框架</div>
            <div className={styles.configFieldRequired}>
              <span className={styles.configFieldRequiredAsterisk}>*</span>必填
            </div>
          </div>
          <Input.TextArea
            value={configDraft.businessFramework}
            onChange={(event) =>
              setConfigDraft((prev) => ({ ...prev, businessFramework: event.target.value }))
            }
            rows={3}
            placeholder="例如：从 GMV、渠道结构、用户效率、风险与下周动作五个维度输出结论"
          />
          <div className={styles.configFieldHint}>
            用法：定义“分析骨架”。这里决定 AI 按什么结构组织结论（如金字塔结构、结论先行）。
          </div>
        </div>
        <div className={styles.configFieldBlock}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>补充提示词</div>
            <div className={styles.configFieldOptional}>选填</div>
          </div>
          <Input.TextArea
            value={configDraft.customPrompt}
            onChange={(event) =>
              setConfigDraft((prev) => ({ ...prev, customPrompt: event.target.value }))
            }
            rows={4}
            placeholder="写你希望 AI 必须遵循的表达风格、输出重点和约束。"
          />
          <div className={styles.configFieldHint}>
            用法：补充输出约束（字数、格式、必须回答点）。不放具体活动数据，避免和事实数据混在一起。
          </div>
        </div>
        <div className={`${styles.configFieldBlock} ${styles.configFieldBlockEmphasis}`}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>场外信息快速填写（无需 JSON）</div>
            <div className={styles.configFieldOptional}>选填</div>
          </div>
          <div className={styles.configBuilderGrid}>
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.campaignsText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({ ...prev, campaignsText: event.target.value }))
              }
              placeholder={'活动信息（每行一条）\n示例：38节预热（3/1~3/8）'}
            />
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.promotionsText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({ ...prev, promotionsText: event.target.value }))
              }
              placeholder={'优惠与满减（每行一条）\n示例：跨店满300减40'}
            />
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.budgetChangesText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({
                  ...prev,
                  budgetChangesText: event.target.value,
                }))
              }
              placeholder={'预算/投放变化（每行一条）\n示例：关键词推广预算+20%'}
            />
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.inventoryNotesText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({
                  ...prev,
                  inventoryNotesText: event.target.value,
                }))
              }
              placeholder={'库存与履约（每行一条）\n示例：明星SKU库存紧张，预计3天补货'}
            />
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.marketSignalsText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({
                  ...prev,
                  marketSignalsText: event.target.value,
                }))
              }
              placeholder={'舆情/竞品动态（每行一条）\n示例：竞品A本周上线买赠活动'}
            />
            <Input.TextArea
              rows={2}
              value={factsBuilderDraft.otherNotesText}
              onChange={(event) =>
                setFactsBuilderDraft((prev) => ({ ...prev, otherNotesText: event.target.value }))
              }
              placeholder={'其他补充（每行一条）\n示例：平台流量分发策略本周有波动'}
            />
          </div>
          <Space className={styles.configBuilderActions} size={8}>
            <Button size="small" onClick={onApplyFactsBuilderToJson}>
              一键写入 JSON
            </Button>
            <Button size="small" onClick={onSyncFactsBuilderFromJson}>
              从 JSON 回填
            </Button>
          </Space>
          <div className={styles.configFieldHint}>
            用法：先在这里填业务事实，再点“一键写入 JSON”，系统会自动转成结构化 JSON。
          </div>
        </div>
        <div className={styles.configFieldBlock}>
          <div className={styles.configFieldLabelRow}>
            <div className={styles.configFieldTitle}>背景信息（JSON）</div>
            <div className={styles.configFieldOptional}>选填</div>
          </div>
          <Input.TextArea
            value={configDraft.factsJsonText}
            onChange={(event) =>
              setConfigDraft((prev) => ({ ...prev, factsJsonText: event.target.value }))
            }
            rows={6}
            placeholder='例如：{"campaign":"618预热","focus":"抖音转化提升"}'
          />
          <div className={styles.configFieldHint}>
            用法：放额外业务事实（活动、满减、预算变化、库存、舆情、竞品动作等），AI 会与页面数据一起综合判断。
          </div>
        </div>
        <div className={styles.configFieldTip}>
          温度使用后端全局配置，推荐：`LLM_TEMPERATURE=1.0`；若使用
          `deepseek-reasoner`，建议 `LLM_REASONER_TIMEOUT_SECONDS &gt;= 660` 且
          `LLM_REASONER_MAX_TOKENS &gt;= 8192`。
        </div>
        {errorText ? (
          <Alert type="error" showIcon title={errorText} />
        ) : null}
      </div>
    </Modal>
  );
}
