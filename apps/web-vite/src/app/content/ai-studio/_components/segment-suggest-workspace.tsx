import { Info } from 'lucide-react';
import { Alert, Button, confirmModal, Segmented, SkeletonText, Tooltip } from '@lobehub/ui';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import { useRef, useState } from 'react';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { type AnalysisDimension, dimensionCopy, groupPresetsByDimension } from '../_lib/analysis-dimension';
import { labelName, presetDisplayName } from '../_lib/segment-display';
import { suggestionPromptLabel } from '../_lib/segment-suggestion-api';
import { analysisCostPerCall, formatCny } from '../_lib/studio-overview';
import { useStudioOverview, useStudioPresets } from './use-ai-studio-queries';
import { useSegmentSuggestionJobs } from './use-segment-suggestions';
import { SuggestionAssetPicker, type SelectedSuggestionAsset } from './suggestion-asset-picker';
import { SuggestionJobTable } from './suggestion-job-table';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { SuggestionLabelPicker } from './suggestion-label-picker';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import suggestStyles from './segment-suggest.module.css';
import workbenchStyles from './studio-workbench.module.css';
import { RefreshButton } from './refresh-button';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

export function SegmentSuggestWorkspace({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const presetsQuery = useStudioPresets(true);
  // One original is one model call; the estimate follows the last 30 days' recorded spend.
  const perAsset = analysisCostPerCall(useStudioOverview({ period: 'last30' }, true).data);
  const [dimension, setDimension] = useState<AnalysisDimension | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSuggestionAsset[]>([]);
  // Candidate labels per preset version; a preset without a stored choice defaults to all labels.
  const [labelChoice, setLabelChoice] = useState<{ presetId: string; keys: string[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const jobsRef = useRef<HTMLElement>(null);
  const { jobsQuery, createMutation, refresh } = useSegmentSuggestionJobs();
  const latestPrompt = suggestionPromptLabel(
    [...(jobsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((job) => job.promptVersion)?.promptVersion,
  );

  const presets = presetsQuery.data ?? [];
  const groups = groupPresetsByDimension(presets);
  const group = groups.find((item) => item.dimension === dimension) ?? groups[0] ?? null;
  const preset = group?.presets.find((item) => `${item.presetKey}:${item.version}` === presetId) ?? group?.presets[0] ?? null;
  const copy = dimensionCopy(group?.dimension ?? 'framework');
  const switchDimension = (next: AnalysisDimension) => {
    setDimension(next);
    setPresetId(null);
    setSelected([]);
    setNotice(null);
  };
  const presetKeyId = preset ? `${preset.presetKey}:${preset.version}` : null;
  const labelKeys =
    preset && labelChoice?.presetId === presetKeyId ? labelChoice.keys : (preset?.labels.map((label) => label.key) ?? []);
  const labelNames = labelKeys.map((key) => labelName(preset ?? undefined, key)).join('、');
  const maxAssets = Math.max(1, capabilities.segmentSuggestMaxAssets);
  const canTrigger =
    capabilities.canWrite && preset !== null && selected.length > 0 && labelKeys.length > 0 && !createMutation.isPending;

  const trigger = () => {
    if (!preset || labelKeys.length === 0) return;
    setNotice(null);
    createMutation.mutate(
      {
        assetIds: selected.map((asset) => asset.assetId),
        presetKey: preset.presetKey,
        presetVersion: preset.version,
        labelKeys,
      },
      {
        onSuccess: (response) => {
          const reused = response.reusedJobIds.length;
          const mismatched = response.labelKeyMismatchJobIds.length;
          setNotice(
            `已提交 ${response.items.length} 条分析任务${reused ? `，其中 ${reused} 条沿用进行中的任务` : ''}${
              mismatched ? `；${mismatched} 条进行中的任务候选${copy.labelNoun}与本次不同，仍按原任务执行，完成后可重新发起` : ''
            }。`,
          );
          setSelected([]);
          setSubmittedIds(response.items.map((job) => job.jobId));
          jobsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        },
      },
    );
  };

  const annotatedCount = selected.filter((asset) => asset.annotated).length;

  return (
    <div className={workbenchStyles.page}>
      <div className={`${workbenchStyles.layout} ${workbenchStyles.layoutFit}`}>
        <article className={pageStyles.card} aria-labelledby="segment-suggest-assets-title">
          <div className={styles.cardHeading}>
            <h2 id="segment-suggest-assets-title">选择原片</h2>
            <span className={suggestStyles.headingMeta}>每次最多 {maxAssets} 条</span>
          </div>
          {preset ? (
            // Remount per preset so paging and filters restart for the new dimension.
            <SuggestionAssetPicker
              key={preset.presetKey}
              maxAssets={maxAssets}
              openAccess={capabilities.openAccess}
              selected={selected}
              onChange={setSelected}
              presetKey={preset.presetKey}
              enterpriseTag={capabilities.enterpriseTag}
            />
          ) : presetsQuery.isPending ? (
            <SkeletonText rows={4} />
          ) : (
            <p className={styles.fieldHelp}>还没有可用的分类预设，暂不能选择原片。</p>
          )}
        </article>

        <aside className={workbenchStyles.side}>
          <article className={`${pageStyles.card} ${workbenchStyles.launch}`} aria-labelledby="segment-suggest-trigger-title">
            <div className={workbenchStyles.launchHead}>
              <h2 id="segment-suggest-trigger-title">发起 AI 切段</h2>
              <span className={workbenchStyles.launchMeta}>
                <Tooltip
                  title={`结果全部进入「待确认」，人工确认后才进入框架片段或卖点片段。已确认和人工片段不会被改动；同一原片旧的 AI 待确认建议会被新结果替换，与已确认片段重复的建议会被跳过。${
                    groups.length === 1 && group?.dimension === 'framework' ? ' 画面分析（痛点、上妆、美展、街采、产展）将在评估完成后开放。' : ''
                  }${preset ? ` 当前${copy.labelNoun}标签为 v${preset.version}，标签版本决定有哪些${copy.labelNoun}。` : ''}${latestPrompt ? ` 最近一次分析使用的 AI 提示词为 ${latestPrompt}。` : ''}`}
                 
                >
                  <Info size={14} strokeWidth={1.8} className={workbenchStyles.infoIcon} tabIndex={0} role="img" aria-label="分析规则" />
                </Tooltip>
              </span>
            </div>
            {presetsQuery.isError ? (
              <Alert type="error" showIcon title="分类预设读取失败" description={errorText(presetsQuery.error)} />
            ) : null}
            {!capabilities.canWrite ? (
              <Alert type="info" showIcon title="当前账号没有素材编辑权限，只能查看分析任务。" />
            ) : null}
            {groups.length > 1 && group ? (
              <div role="group" aria-label="分析类型">
                <Segmented<AnalysisDimension>
                  value={group.dimension}
                  options={groups.map((item) => ({ value: item.dimension, label: dimensionCopy(item.dimension).title }))}
                  onChange={switchDimension}
                />
              </div>
            ) : null}
            {group && group.presets.length > 1 && preset ? (
              <LabeledSelect
                label="分类预设版本"
                wrapperClassName={styles.presetSelect}
                value={`${preset.presetKey}:${preset.version}`}
                options={group.presets.map((item) => ({ value: `${item.presetKey}:${item.version}`, label: presetDisplayName(item, group.presets) }))}
                onChange={(value) => typeof value === 'string' && setPresetId(value)}
              />
            ) : null}
            {preset ? (
              <SuggestionLabelPicker
                labels={preset.labels}
                value={labelKeys}
                onChange={(keys) => presetKeyId && setLabelChoice({ presetId: presetKeyId, keys })}
                disabled={!capabilities.canWrite}
                noun={copy.labelNoun}
              />
            ) : presetsQuery.isPending ? (
              <SkeletonText rows={1} />
            ) : null}
            <div className={suggestStyles.selectedBlock}>
              <div className={suggestStyles.selectedHeading}>
                <span aria-live="polite">已选原片 {selected.length}/{maxAssets}</span>
                {selected.length > 0 ? <Button type="link" size="small" onClick={() => setSelected([])}>清空</Button> : null}
              </div>
              {selected.length === 0 ? (
                <p className={suggestStyles.selectedEmpty}>在左侧列表勾选要分析的原片。</p>
              ) : (
                <ul className={suggestStyles.selectedList}>
                  {selected.map((asset) => (
                    <li key={asset.assetId}>
                      {asset.coverUrl ? <img className={suggestStyles.selectedCover} src={asset.coverUrl} alt="" /> : <span className={suggestStyles.selectedCover} aria-hidden />}
                      <span className={suggestStyles.selectedTitle} title={asset.title}>{asset.title}</span>
                      <Button
                        type="text"
                        size="small"
                        aria-label={`移除 ${asset.title}`}
                        onClick={() => setSelected(selected.filter((item) => item.assetId !== asset.assetId))}
                      >
                        移除
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {annotatedCount > 0 ? (
                <p className={styles.fieldHelp}>其中 {annotatedCount} 条已标注过：只替换旧的待确认建议，与已确认片段重复的会被跳过。</p>
              ) : null}
            </div>
            <div className={workbenchStyles.launchFoot}>
              <AiActionButton
                block
                disabled={!canTrigger}
                loading={createMutation.isPending}
                onClick={() =>
                  confirmModal({
                    title: '确认发起 AI 切段？',
                    content: `将对 ${selected.length} 条原片各调用一次视频模型（可能产生费用），失败不会自动重试。本次候选${copy.labelNoun}：${labelNames}。`,
                    okText: '发起',
                    cancelText: '取消',
                    onOk: trigger,
                  })
                }
              >
                开始分析{selected.length > 0 ? `（${selected.length} 条）` : ''}
              </AiActionButton>
              <p className={workbenchStyles.estimate}>
                {selected.length > 0
                  ? `预计约 ${formatCny(selected.length * perAsset.cny)}，以账单为准`
                  : `${perAsset.measured ? '按近 30 天实际' : '按近期实测'}每条约 ${formatCny(perAsset.cny)}`}
              </p>
            </div>
            {createMutation.isError ? (
              <Alert type="error" showIcon title="分析任务提交失败" description={errorText(createMutation.error)} />
            ) : null}
            {notice ? <Alert type="success" showIcon title={notice} /> : null}
          </article>

        </aside>
      </div>

      {/* Full width under the workbench: a run's result reads on one line instead of four. */}
      <article ref={jobsRef} className={`${pageStyles.card} ${workbenchStyles.runsCard}`} aria-labelledby="segment-suggest-jobs-title">
        <div className={styles.cardHeading}>
          <h2 id="segment-suggest-jobs-title">最近分析</h2>
          <RefreshButton onRefresh={() => void refresh()} loading={jobsQuery.isFetching} />
        </div>
        {jobsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="分析任务读取失败"
            description={errorText(jobsQuery.error)}
            action={<Button size="small" onClick={() => void refresh()}>重试</Button>}
          />
        ) : (
          <SuggestionJobTable jobs={jobsQuery.data ?? []} presets={presets} loading={jobsQuery.isPending} highlightIds={submittedIds} />
        )}
      </article>
    </div>
  );
}
