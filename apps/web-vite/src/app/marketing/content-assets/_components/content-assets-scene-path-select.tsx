import type { ContentAssetSceneCascaderOption } from '../_lib/content-assets-ui-helpers';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import styles from './content-assets-scene-path-select.module.css';

const LEVELS = [
  { label: '场景类型', placeholder: '选择场景类型' },
  { label: '大场景', placeholder: '选择大场景' },
  { label: '细分场景', placeholder: '选择细分场景' },
] as const;

interface ContentAssetsScenePathSelectProps {
  /** 场景类型 → 大场景 → 细分场景 tree. */
  options: ContentAssetSceneCascaderOption[];
  /** Selected path; any prefix is valid (a path may stop at any level). */
  value: readonly string[];
  onChange: (path: string[]) => void;
  /** Group name, e.g. 「内容场景路径」. */
  label: string;
  id?: string;
  disabled?: boolean;
  /** Shown on the first level while disabled, e.g. 「先选择单一产品品类」. */
  disabledPlaceholder?: string;
  allowClear?: boolean;
}

function levelOptions(nodes: ContentAssetSceneCascaderOption[], current?: string) {
  const options = nodes.map((node) => ({ label: node.label, value: node.value }));
  // Keep a saved value that has left the tree readable instead of showing an empty select.
  if (current && !nodes.some((node) => node.value === current)) options.push({ label: current, value: current });
  return options;
}

/**
 * Three linked selects replacing the scene Cascader: choosing a level clears the levels below it,
 * and each level lists the children of the level above.
 */
export function ContentAssetsScenePathSelect({
  options,
  value,
  onChange,
  label,
  id,
  disabled = false,
  disabledPlaceholder,
  allowClear = true,
}: ContentAssetsScenePathSelectProps) {
  const levels: ContentAssetSceneCascaderOption[][] = [options];
  for (let depth = 0; depth < LEVELS.length - 1; depth += 1) {
    const parent = levels[depth]?.find((node) => node.value === value[depth]);
    levels.push(parent?.children ?? []);
  }
  const choose = (depth: number, next: string | undefined) => {
    const path = value.slice(0, depth);
    onChange(next ? [...path, next] : path);
  };

  return (
    <div className={styles.scenePath} role="group" aria-label={label}>
      {LEVELS.map((level, depth) => {
        const nodes = levels[depth] ?? [];
        const current = value[depth];
        const reachable = depth === 0 || Boolean(value[depth - 1]);
        if (depth > 0 && nodes.length === 0 && !current) return null;
        return (
          <LabeledSelect
            key={level.label}
            id={id && depth === 0 ? id : undefined}
            label={level.label}
            wrapperClassName={styles.sceneLevel}
            allowClear={allowClear}
            disabled={disabled || !reachable}
            placeholder={disabled && depth === 0 && disabledPlaceholder ? disabledPlaceholder : level.placeholder}
            value={current}
            options={levelOptions(nodes, current)}
            onChange={(next) => choose(depth, next)}
          />
        );
      })}
    </div>
  );
}
