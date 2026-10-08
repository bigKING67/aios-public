import { FileImageOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { shortAssetTitle, type ReferenceAssetOption } from '../_lib/remix-form';
import { labelName } from '../_lib/segment-display';
import styles from './segment-annotation.module.css';
import pickerStyles from './remix-reference-picker.module.css';

const COLLAPSED_COUNT = 8;

interface RemixReferencePickerProps {
  preset: StudioSegmentPreset;
  references: readonly ReferenceAssetOption[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
  selectedId: string | null;
  disabled: boolean;
  onPick: (option: ReferenceAssetOption) => void;
  onClear: () => void;
}

function chainText(option: ReferenceAssetOption, preset: StudioSegmentPreset): string {
  return option.labels.map((key) => labelName(preset, key)).join(' → ');
}

function Cover({ option }: { option: ReferenceAssetOption }) {
  return (
    <span className={pickerStyles.cover} aria-hidden>
      {option.coverUrl ? <img src={option.coverUrl} alt="" loading="lazy" /> : <FileImageOutlined />}
    </span>
  );
}

/**
 * Reference originals as cards: each shows what it looks like, its framework
 * chain and its product, so choosing a structure is a visual pick instead of
 * a title list. Once picked it collapses to one line with a way back.
 */
export function RemixReferencePicker({
  preset,
  references,
  loading,
  error,
  truncated,
  selectedId,
  disabled,
  onPick,
  onClear,
}: RemixReferencePickerProps) {
  const [showAll, setShowAll] = useState(false);
  const selected = references.find((item) => item.assetId === selectedId);

  if (selected) {
    const chain = chainText(selected, preset);
    return (
      <div className={pickerStyles.selected} aria-label="已选参考原片">
        <Cover option={selected} />
        <span className={pickerStyles.body}>
          <span className={pickerStyles.title} title={selected.title}>{shortAssetTitle(selected.title)}</span>
          <span className={pickerStyles.chain} title={chain}>{chain}</span>
        </span>
        <Button size="small" onClick={onClear} disabled={disabled}>
          换一个
        </Button>
      </div>
    );
  }
  if (loading) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  if (error) return <Alert type="error" showIcon title="参考原片读取失败，请刷新后重试。" />;
  if (references.length === 0) {
    return (
      <p className={styles.fieldHelp}>
        还没有带已确认片段的原片。先在 AI 分析里分析并确认片段，或改用手动排列框架顺序。{' '}
        <RouterLink className={styles.tableLink} to={ROUTE_PATHS.contentAiStudioAnalysis}>
          去 AI 分析
        </RouterLink>
      </p>
    );
  }

  const visible = showAll ? references : references.slice(0, COLLAPSED_COUNT);
  return (
    <div className={pickerStyles.stack}>
      <ul className={pickerStyles.grid} aria-label="参考原片">
        {visible.map((option) => {
          const chain = chainText(option, preset);
          return (
            <li key={option.assetId}>
              <button
                type="button"
                className={pickerStyles.card}
                disabled={disabled}
                onClick={() => onPick(option)}
                aria-label={`选择参考原片 ${option.title}`}
                title={`${option.title}\n${chain}`}
              >
                <Cover option={option} />
                <span className={pickerStyles.body}>
                  <span className={pickerStyles.title}>{shortAssetTitle(option.title)}</span>
                  <span className={pickerStyles.chain}>{chain}</span>
                  <span className={pickerStyles.meta}>
                    {option.productName ? `${option.productName} · ` : ''}
                    {option.labels.length} 段
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {references.length > COLLAPSED_COUNT ? (
        <Button type="link" size="small" className={pickerStyles.more} onClick={() => setShowAll((value) => !value)}>
          {showAll ? '收起' : `显示全部 ${references.length} 条`}
        </Button>
      ) : null}
      {truncated ? <p className={styles.fieldHelp}>已确认片段较多，只读取了前 1000 段；找不到的原片可改用手动排列。</p> : null}
    </div>
  );
}
