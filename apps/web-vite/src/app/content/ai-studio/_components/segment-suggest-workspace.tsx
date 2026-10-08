import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm, Segmented, Select, Skeleton, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { type AnalysisDimension, dimensionCopy, groupPresetsByDimension } from '../_lib/analysis-dimension';
import { labelName, presetDisplayName } from '../_lib/segment-display';
import { suggestionPromptLabel } from '../_lib/segment-suggestion-api';
import { useStudioPresets } from './use-ai-studio-queries';
import { useSegmentSuggestionJobs } from './use-segment-suggestions';
import { SuggestionAssetPicker, type SelectedSuggestionAsset } from './suggestion-asset-picker';
import { SuggestionJobTable } from './suggestion-job-table';
import { SuggestionLabelPicker } from './suggestion-label-picker';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import suggestStyles from './segment-suggest.module.css';
import workbenchStyles from './studio-workbench.module.css';

/**
 * Rough per-original model cost for the confirm dialog: 9 production calls on
 * 2026-09-30 averaged ¥0.05 at list price. The home overview shows real spend.
 */
const ESTIMATED_CNY_PER_ASSET = 0.05;

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

export function SegmentSuggestWorkspace({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const presetsQuery = useStudioPresets(true);
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
    <div className={suggestStyles.stack}>
      <div className={workbenchStyles.layout}>
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
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <p className={styles.fieldHelp}>还没有可用的分类预设，暂不能选择原片。</p>
          )}
        </article>

        <aside className={workbenchStyles.side}>
          <article className={`${pageStyles.card} ${workbenchStyles.launch}`} aria-labelledby="segment-suggest-trigger-title">
            <div className={workbenchStyles.launchHead}>
              <h2 id="segment-suggest-trigger-title">发起 AI 分析</h2>
              <span className={workbenchStyles.launchMeta}>
                {preset && !(group && group.presets.length > 1) ? `${copy.labelNoun}标签 v${preset.version}` : null}
                <Tooltip
                  title={`结果全部进入「待确认」，人工确认后才进入片段素材。已确认和人工片段不会被改动；同一原片旧的 AI 待确认建议会被新结果替换，与已确认片段重复的建议会被跳过。${
                    groups.length === 1 && group?.dimension === 'framework' ? ' 画面分析（痛点、上妆、美展、街采、产展）将在评估完成后开放。' : ''
                  }${latestPrompt ? ` 标签版本决定有哪些${copy.labelNoun}；最近一次分析使用的 AI 提示词为 ${latestPrompt}。` : ''}`}
                  trigger={['hover', 'focus']}
                >
                  <InfoCircleOutlined className={workbenchStyles.infoIcon} tabIndex={0} aria-label="分析规则" />
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
              <Segmented<AnalysisDimension>
                aria-label="分析类型"
                value={group.dimension}
                options={groups.map((item) => ({ value: item.dimension, label: dimensionCopy(item.dimension).title }))}
                onChange={switchDimension}
              />
            ) : null}
            {group && group.presets.length > 1 && preset ? (
              <Select
                aria-label="分类预设版本"
                className={styles.presetSelect}
                value={`${preset.presetKey}:${preset.version}`}
                options={group.presets.map((item) => ({ value: `${item.presetKey}:${item.version}`, label: presetDisplayName(item) }))}
                onChange={setPresetId}
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
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            ) : null}
            <div className={suggestStyles.selectedBlock}>
              <div className={suggestStyles.selectedHeading}>
                <span aria-live="polite">已选原片 {selected.length}/{maxAssets}</span>
                {selected.length > 0 ? <Button type="link" size="small" onClick={() => setSelected([])}>清空</Button> : null}
              </div>
              {selected.length === 0 ? (
                <p className={suggestStyles.selectedEmpty}>在原片列表里勾选要分析的原片，最多 {maxAssets} 条。</p>
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
              <Popconfirm
                title="确认发起 AI 分析？"
                description={`将对 ${selected.length} 条原片各调用一次视频模型（可能产生费用），失败不会自动重试。本次候选${copy.labelNoun}：${labelNames}。`}
                okText="发起"
                cancelText="取消"
                onConfirm={trigger}
                disabled={!canTrigger}
              >
                <Button type={canTrigger ? 'primary' : 'default'} block disabled={!canTrigger} loading={createMutation.isPending}>
                  开始分析{selected.length > 0 ? `（${selected.length} 条）` : ''}
                </Button>
              </Popconfirm>
              <p className={workbenchStyles.estimate}>
                {selected.length > 0
                  ? `预计约 ¥${(selected.length * ESTIMATED_CNY_PER_ASSET).toFixed(2)}，以账单为准`
                  : `按近期实测每条约 ¥${ESTIMATED_CNY_PER_ASSET.toFixed(2)}`}
              </p>
            </div>
            {createMutation.isError ? (
              <Alert type="error" showIcon title="分析任务提交失败" description={errorText(createMutation.error)} />
            ) : null}
            {notice ? <Alert type="success" showIcon title={notice} /> : null}
          </article>

          <article ref={jobsRef} className={`${pageStyles.card} ${workbenchStyles.recentCard}`} aria-labelledby="segment-suggest-jobs-title">
            <div className={styles.cardHeading}>
              <h2 id="segment-suggest-jobs-title">最近分析</h2>
              <Button size="small" onClick={() => void refresh()} loading={jobsQuery.isFetching}>
                刷新
              </Button>
            </div>
            <div className={workbenchStyles.recentBody}>
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
            </div>
          </article>
        </aside>
      </div>
    </div>
  );
}
