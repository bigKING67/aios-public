import { CheckCircleFilled, InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, InputNumber, Popconfirm, Radio, Select, Skeleton, Tooltip } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { newRemixIdempotencyKey } from '../_lib/remix-api';
import { buildRemixPreviewRequest, type ReferenceAssetOption, type RemixStructure } from '../_lib/remix-form';
import { buildRemixBatchPath } from '../_lib/remix-routes';
import { labelName, pickDefaultPreset, presetDisplayName } from '../_lib/segment-display';
import { FrameworkRemixPreview, FrameworkRemixSummary } from './framework-remix-preview';
import { FrameworkRemixStructure } from './framework-remix-structure';
import { RemixCandidates } from './remix-candidates';
import { RemixRecentBatches } from './remix-recent-batches';
import { useStudioPresets } from './use-ai-studio-queries';
import { useCreateRemixBatch, useRemixPreview, useRemixProducts } from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';
import workbenchStyles from './studio-workbench.module.css';

const REMIX_RULES =
  '按框架顺序从已确认片段中确定性组合，不调用模型选片；每条成片只用同一产品的片段，同一片段不会在一条成片里重复出现，各片段保留原声。';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

/**
 * 框架混剪 workbench: product and structure on the left with the structure
 * timeline, the generate card and recent batches in the sticky side column.
 */
export function FrameworkRemixForm({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const navigate = useNavigate();
  const presetsQuery = useStudioPresets(true);
  const [presetId, setPresetId] = useState<string | null>(null);
  const presets = presetsQuery.data ?? [];
  const preset = presets.find((item) => `${item.presetKey}:${item.version}` === presetId) ?? pickDefaultPreset(presets);
  const [structure, setStructure] = useState<RemixStructure>({ mode: 'reference', sourceAssetId: null });
  const [productName, setProductName] = useState<string | null>(null);
  const maxPerBatch = Math.max(1, capabilities.remixMaxPerBatch);
  const [count, setCount] = useState<number | null>(Math.min(3, maxPerBatch));
  // One key per submission attempt; kept after an ambiguous failure so a retry is idempotent.
  const [idempotencyKey, setIdempotencyKey] = useState(newRemixIdempotencyKey);

  const products = useRemixProducts(preset ? { presetKey: preset.presetKey, version: preset.version } : null);
  const built = buildRemixPreviewRequest(preset, structure, productName, count);
  const request = typeof built === 'string' ? null : built;
  const { query: preview, settled: previewSettled } = useRemixPreview(request);
  const create = useCreateRemixBatch();
  const current = preview.data && request && previewSettled && !preview.isPlaceholderData ? preview.data : undefined;
  const plannable = current?.plannableCount ?? 0;
  const canSubmit = capabilities.canWrite && request !== null && plannable > 0 && !create.isPending && !preview.isFetching;

  // While a create is in flight the form is frozen: resetting the mutation would drop its
  // redirect and a fresh key would let a second click queue a second batch.
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    if (create.isPending) return;
    setter(value);
    create.reset();
    setIdempotencyKey(newRemixIdempotencyKey());
  };

  // A reference original brings its own product unless one is already chosen.
  const pickReference = (option: ReferenceAssetOption) => {
    if (productName || !option.productName) return;
    if ((products.data ?? []).some((item) => item.productName === option.productName)) edit(setProductName)(option.productName);
  };

  const submit = () => {
    if (!request) return;
    create.mutate(
      { ...request, idempotencyKey },
      { onSuccess: (detail) => navigate(buildRemixBatchPath(detail.batch.batchId)) },
    );
  };

  if (presetsQuery.isPending) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (presetsQuery.isError || !preset) {
    return <Alert type="error" showIcon title="分类预设读取失败" description={errorText(presetsQuery.error)} />;
  }

  const structureChosen = structure.mode === 'reference' ? Boolean(structure.sourceAssetId) : structure.labels.length > 0;
  const blocker = !capabilities.canWrite
    ? '没有素材编辑权限，不能生成。'
    : !productName
      ? '先选择产品。'
      : structure.mode === 'reference' && !structure.sourceAssetId
        ? '先选择参考原片。'
        : structure.mode === 'manual' && structure.labels.length === 0
          ? '至少添加一位框架。'
          : request === null
            ? '填写生成数量。'
            : preview.isError
              ? '可用组合读取失败，请稍后重试。'
              : !current || preview.isFetching
                ? '正在计算可用组合…'
                : plannable === 0
                  ? current.missingLabels.length > 0
                    ? `缺少可用片段：${current.missingLabels.map((key) => labelName(preset, key)).join('、')}。`
                    : '没有可生成的新组合，请调整结构或产品。'
                  : null;

  return (
    <div className={workbenchStyles.layout}>
      <article className={pageStyles.card} aria-labelledby="remix-form-title">
        <div className={styles.cardHeading}>
          <h2 id="remix-form-title">产品与结构</h2>
          {presets.length > 1 ? (
            <Select
              aria-label="分类预设"
              className={styles.presetSelect}
              value={`${preset.presetKey}:${preset.version}`}
              options={presets.map((item) => ({ value: `${item.presetKey}:${item.version}`, label: presetDisplayName(item) }))}
              onChange={edit((value: string) => {
                setPresetId(value);
                setStructure({ mode: 'reference', sourceAssetId: null });
                setProductName(null);
              })}
            />
          ) : null}
        </div>
        {!capabilities.canWrite ? <Alert type="info" showIcon title="当前账号没有素材编辑权限，只能查看。" /> : null}
        <div className={remixStyles.setupRow}>
          <div className={styles.field}>
            <label htmlFor="remix-product" className={remixStyles.fieldLabel}>产品</label>
            <Select
              id="remix-product"
              showSearch
              placeholder="选择片段的产品"
              loading={products.isPending}
              disabled={!capabilities.canWrite}
              value={productName ?? undefined}
              options={(products.data ?? []).map((item) => ({
                value: item.productName,
                label: `${item.productName}（${item.confirmedSegmentCount} 段）`,
              }))}
              onChange={edit((value: string) => setProductName(value))}
              notFoundContent={products.isError ? '产品读取失败' : '还没有带产品的已确认片段'}
            />
          </div>
          <div className={styles.field}>
            <span className={remixStyles.fieldLabel}>框架结构</span>
            <Radio.Group
              aria-label="结构来源"
              optionType="button"
              value={structure.mode}
              disabled={!capabilities.canWrite}
              onChange={(event) =>
                edit(setStructure)(
                  event.target.value === 'reference'
                    ? { mode: 'reference', sourceAssetId: null }
                    : { mode: 'manual', labels: preview.data?.labels ?? [] },
                )
              }
              options={[
                { value: 'reference', label: '沿用参考原片' },
                { value: 'manual', label: '手动排列框架顺序' },
              ]}
            />
          </div>
        </div>
        <FrameworkRemixStructure
          preset={preset}
          value={structure}
          onChange={edit(setStructure)}
          onReferencePicked={pickReference}
          disabled={!capabilities.canWrite}
        />
        {structureChosen ? (
        <section className={remixStyles.stack} aria-labelledby="remix-preview-title">
          <h3 id="remix-preview-title" className={remixStyles.sectionTitle}>结构预览</h3>
          <FrameworkRemixPreview
            preset={preset}
            preview={request ? preview.data : undefined}
            loading={preview.isFetching || !previewSettled}
            error={preview.isError ? errorText(preview.error) : null}
            incompleteHint={typeof built === 'string' ? built.replace('后显示可用组合', '后显示每一位的可用片段') : null}
          />
        </section>
        ) : null}
        {request && preview.data && !preview.isError ? (
          <section className={remixStyles.stack} aria-labelledby="remix-candidates-title">
            <h3 id="remix-candidates-title" className={remixStyles.sectionTitle}>候选片段</h3>
            <RemixCandidates preset={preset} preview={preview.data} />
          </section>
        ) : null}
      </article>

      <aside className={workbenchStyles.side}>
        <article className={`${pageStyles.card} ${workbenchStyles.launch}`} aria-labelledby="remix-launch-title">
          <div className={workbenchStyles.launchHead}>
            <h2 id="remix-launch-title">生成成片</h2>
            <span className={workbenchStyles.launchMeta}>
              框架标签 v{preset.version}
              <Tooltip title={REMIX_RULES} trigger={['hover', 'focus']}>
                <InfoCircleOutlined className={workbenchStyles.infoIcon} tabIndex={0} aria-label="混剪规则" />
              </Tooltip>
            </span>
          </div>
          {current ? (
            <FrameworkRemixSummary preview={current} />
          ) : (
            <ol className={remixStyles.steps} aria-label="生成步骤">
              {[
                { done: Boolean(productName), label: productName ? `产品：${productName}` : '选择产品' },
                {
                  done: structure.mode === 'reference' ? Boolean(structure.sourceAssetId) : structure.labels.length > 0,
                  label: structure.mode === 'reference' ? '选一条参考原片定结构' : '排好框架顺序',
                },
                { done: false, label: '确认数量后生成' },
              ].map((step) => (
                <li key={step.label} className={step.done ? remixStyles.stepDone : undefined}>
                  {step.done ? <CheckCircleFilled aria-hidden /> : <span className={remixStyles.stepDot} aria-hidden />}
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          )}
          <div className={styles.field}>
            <label htmlFor="remix-count" className={remixStyles.fieldLabel}>生成数量（每批最多 {maxPerBatch} 条）</label>
            <InputNumber
              id="remix-count"
              min={1}
              max={maxPerBatch}
              precision={0}
              disabled={!capabilities.canWrite}
              value={count}
              onChange={edit((value: number | null) => setCount(value))}
            />
          </div>
          <div className={workbenchStyles.launchFoot}>
            <Popconfirm
              title={`确认生成 ${plannable} 条框架混剪？`}
              description="成片按顺序进入渲染队列（单通道依次处理，可能需要较长时间）。提交后不会自动重试，可在「成片」查看进度。"
              okText="开始生成"
              cancelText="取消"
              onConfirm={submit}
              disabled={!canSubmit}
            >
              <Button type={canSubmit ? 'primary' : 'default'} block disabled={!canSubmit} loading={create.isPending}>
                {plannable > 0 ? `生成 ${plannable} 条成片` : '生成成片'}
              </Button>
            </Popconfirm>
            <p className={workbenchStyles.estimate}>
              {blocker ?? `1080×1920 · 30fps · 最长 ${capabilities.remixMaxSeconds} 秒，统一响度 -14 LUFS；非 9:16 原片会有黑边。`}
            </p>
          </div>
          {create.isError ? <Alert type="error" showIcon title="批次提交失败" description={errorText(create.error)} /> : null}
        </article>
        <RemixRecentBatches presets={presets} openAccess={capabilities.openAccess} mode="framework" />
      </aside>
    </div>
  );
}
