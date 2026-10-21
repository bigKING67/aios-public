import { ArrowRightOutlined } from '@ant-design/icons';
import { Alert, Skeleton } from 'antd';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import type { StudioRemixBatchPreviewResponse } from '../_lib/remix-api';
import { labelName } from '../_lib/segment-display';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';

interface FrameworkRemixPreviewProps {
  preset: StudioSegmentPreset;
  preview: StudioRemixBatchPreviewResponse | undefined;
  loading: boolean;
  error: string | null;
  incompleteHint: string | null;
  /** Selling-point key → name, for 卖点混剪 slot targets. */
  pointNames?: (keys: readonly string[]) => string[];
}

function formatRemixCount(value: number): string {
  return value >= Number.MAX_SAFE_INTEGER ? '极多' : value.toLocaleString('zh-CN');
}

/** The structure as an ordered row of slots, each with how many usable segments it has. */
export function FrameworkRemixPreview({ preset, preview, loading, error, incompleteHint, pointNames }: FrameworkRemixPreviewProps) {
  if (incompleteHint) return <p className={styles.fieldHelp}>{incompleteHint}</p>;
  if (error) return <Alert type="error" showIcon title="可用组合读取失败" description={error} />;
  if (!preview) return loading ? <Skeleton active paragraph={{ rows: 2 }} title={false} /> : null;
  const missing = preview.missingLabels.map((key) => labelName(preset, key));
  const sellingPoint = preview.mode === 'sellingPoint';
  return (
    <div className={remixStyles.stack} aria-busy={loading}>
      <ol className={remixStyles.timeline} aria-label="框架结构">
        {preview.slots.map((slot, index) => {
          const gap = slot.candidateCount === 0;
          return (
            <li key={slot.ordinal}>
              <span className={gap ? `${remixStyles.slot} ${remixStyles.slotGap}` : remixStyles.slot}>
                <span className={remixStyles.slotOrdinal}>{slot.ordinal}</span>
                <span className={remixStyles.slotName}>{labelName(preset, slot.labelKey)}</span>
                <span className={remixStyles.slotCount}>
                  {gap ? '待补' : sellingPoint ? `${slot.candidateCount} 种填法` : `${slot.candidateCount} 段`}
                </span>
                {sellingPoint ? <SlotTarget slot={slot} pointNames={pointNames} /> : null}
              </span>
              {index < preview.slots.length - 1 ? <ArrowRightOutlined className={remixStyles.slotArrow} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      {missing.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`缺少可用片段的框架：${missing.join('、')}`}
          description={
            <>
              请先为「{preview.productName}」确认这类片段，或调整框架顺序。{' '}
              <RouterLink className={remixStyles.gapLink} to={ROUTE_PATHS.contentAiStudioSegments}>
                去框架片段
              </RouterLink>
            </>
          }
        />
      ) : null}
      {preview.shortfallReason && missing.length === 0 ? <Alert type="warning" showIcon title={preview.shortfallReason} /> : null}
      {preview.excludedAssetCount > 0 ? (
        <Alert
          type="info"
          showIcon
          title={`${preview.excludedAssetCount} 条原片因授权受限、无编辑权限或未就绪，其片段不参与组合。`}
        />
      ) : null}
      <p className={styles.fieldHelp}>
        {sellingPoint
          ? '每段的填法数为该产品已确认卖点片段能拼出的方案（含整段替换）；「整段替换」的框架段按框架混剪规则用其他原片的同类框架段整段替换。'
          : '每位的片段数为该产品已确认、可用的片段。'}可用组合已排除同一片段重复出现、总时长超限
        {preview.previouslyUsedCombinations > 0 ? `、你此前批次用过的 ${formatRemixCount(preview.previouslyUsedCombinations)} 种` : '、你此前批次用过的'}
        组合{preview.referenceCombinationExcluded ? '，以及和参考原片完全相同的那一种' : ''}；同样的输入得到同样的结果。
      </p>
    </div>
  );
}

/** 卖点混剪 slot: the reference's selling points in order, or 整段替换 when the slot falls back. */
function SlotTarget({
  slot,
  pointNames,
}: {
  slot: StudioRemixBatchPreviewResponse['slots'][number];
  pointNames?: (keys: readonly string[]) => string[];
}) {
  if (slot.fallback || !slot.sellingPoints?.length) {
    return <span className={remixStyles.slotTarget}>整段替换</span>;
  }
  const names = pointNames ? pointNames(slot.sellingPoints) : slot.sellingPoints;
  return (
    <span className={remixStyles.slotTarget} title={`目标卖点：${names.join(' + ')}`}>
      {names.join(' + ')}
    </span>
  );
}

/** Side-card numbers: what this batch will produce and how much room is left. */
export function FrameworkRemixSummary({ preview }: { preview: StudioRemixBatchPreviewResponse | undefined }) {
  return (
    <dl className={`${remixStyles.metrics} ${remixStyles.summary}`}>
      <div className={remixStyles.metric}>
        <dt>本次可生成</dt>
        <dd>{preview ? `${preview.plannableCount} / ${preview.requestedCount} 条` : '--'}</dd>
      </div>
      <div className={remixStyles.metric}>
        <dt>可用组合</dt>
        <dd>
          {preview ? `${preview.availableIsLowerBound ? '≥ ' : ''}${formatRemixCount(preview.availableCombinations)}` : '--'}
        </dd>
      </div>
    </dl>
  );
}
