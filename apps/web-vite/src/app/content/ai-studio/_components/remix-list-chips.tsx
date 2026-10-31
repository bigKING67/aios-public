import { Tooltip } from '@lobehub/ui';
import { REMIX_BATCH_MODES, remixModeLabel, type RemixBatchMode, type StudioRemixBatchListResponse } from '../_lib/remix-api';
import { OUTPUTS_PENDING, OUTPUTS_QUALITY_FAILED, OUTPUTS_REJECTED, OUTPUTS_WITHOUT } from '../_lib/remix-routes';
import libraryStyles from './segment-library.module.css';
import outputStyles from './remix-outputs.module.css';

/** The list's tab: one 成片 type (null for 全部), or a state across every type (待审核, 未成片). */
export type ListTab = RemixBatchMode | null | typeof OUTPUTS_PENDING | typeof OUTPUTS_REJECTED | typeof OUTPUTS_QUALITY_FAILED | typeof OUTPUTS_WITHOUT;

const PENDING_REVIEW_HINT = '有成片等待人工审核的批次';
const REJECTED_REVIEW_HINT = '保留已驳回记录的批次';
const QC_FAILED_HINT = '有自动质检未通过或未完成条目的批次';
const WITHOUT_OUTPUTS_HINT = '失败、已取消或成片已删除的批次';

/**
 * One chip per 成片 type, counting the type's batches that still have outputs to watch, then the
 * states past a divider — 待审核 (an output waits for a person) and 未成片 (nothing to watch) —
 * which are not types and list every type's batches.
 */
export function ListChips({ counts, tab, onSelect }: { counts: StudioRemixBatchListResponse['counts']; tab: ListTab; onSelect: (tab: ListTab) => void }) {
  const chips = [
    { tab: null, name: '全部', count: counts.withOutputs.all },
    ...REMIX_BATCH_MODES.map((key) => ({ tab: key, name: remixModeLabel(key), count: counts.withOutputs[key] })),
  ];
  // States across every type, shown while they hold batches (or while open).
  const stateChips: { tab: ListTab; name: string; hint: string; count: number }[] = [
    { tab: OUTPUTS_PENDING, name: '待审核', hint: PENDING_REVIEW_HINT, count: counts.pendingReview.all },
    { tab: OUTPUTS_REJECTED, name: '已驳回', hint: REJECTED_REVIEW_HINT, count: counts.rejected.all },
    { tab: OUTPUTS_QUALITY_FAILED, name: '质检未通过', hint: QC_FAILED_HINT, count: counts.qcFailed.all },
    { tab: OUTPUTS_WITHOUT, name: '未成片', hint: WITHOUT_OUTPUTS_HINT, count: counts.withoutOutputs.all },
  ];
  const states = stateChips.filter((chip) => chip.count > 0 || chip.tab === tab);
  return (
    <div className={libraryStyles.chipsGroup}>
      <div className={libraryStyles.chips} role="group" aria-label="成片筛选">
        {chips.map((chip) => {
          const active = chip.tab === tab;
          return (
            <button
              key={chip.tab ?? 'all'}
              type="button"
              className={`${libraryStyles.chip} ${active ? libraryStyles.chipActive : ''}`}
              aria-pressed={active}
              aria-label={`${chip.name}：${chip.count} 个有成片的批次`}
              onClick={() => onSelect(chip.tab)}
            >
              <span className={libraryStyles.chipName}>{chip.name}</span>
              <span className={libraryStyles.chipCount}>{chip.count}</span>
            </button>
          );
        })}
        {states.length > 0 ? <span className={outputStyles.chipDivider} aria-hidden /> : null}
        {states.map((chip) => {
          const active = chip.tab === tab;
          return (
            <Tooltip key={chip.tab} title={chip.hint}>
              <button
                type="button"
                className={`${libraryStyles.chip} ${active ? libraryStyles.chipActive : ''}`}
                aria-pressed={active}
                aria-label={`${chip.name}：${chip.count} 个${chip.hint}`}
                onClick={() => onSelect(chip.tab)}
              >
                <span className={libraryStyles.chipName}>{chip.name}</span>
                <span className={libraryStyles.chipCount}>{chip.count}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
