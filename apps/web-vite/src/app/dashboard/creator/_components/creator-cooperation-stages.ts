import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toNullableNumber, type NumericInput } from './creator-formatters';

export interface CreatorOrderedInfluencerRow {
  sequence_no: NumericInput;
  influencer_name: string | null;
}

export interface CreatorAnchorLevelRow extends CreatorOrderedInfluencerRow {
  anchor_level: string | null;
}

export interface CreatorCooperationStageMeta<TKey extends string> {
  key: TKey;
  label: string;
}

export interface CreatorCooperationStageRows<TKey extends string, TRow> extends CreatorCooperationStageMeta<TKey> {
  rows: TRow[];
}

export interface CreatorCooperationStageSelectionState<TKey extends string, TRow> {
  selectedCooperationStage: TKey | null;
  setSelectedCooperationStage: Dispatch<SetStateAction<TKey | null>>;
  cooperationStageTotalCount: number;
  selectedCooperationStageRows: TRow[];
}

interface UseCreatorCooperationStageSelectionParams<TKey extends string, TRow> {
  stages: readonly CreatorCooperationStageMeta<TKey>[];
  rows: readonly CreatorCooperationStageRows<TKey, TRow>[];
}

export function useCreatorCooperationStageSelection<TKey extends string, TRow>({
  stages,
  rows,
}: UseCreatorCooperationStageSelectionParams<TKey, TRow>): CreatorCooperationStageSelectionState<TKey, TRow> {
  const [selectedCooperationStage, setSelectedCooperationStage] = useState<TKey | null>(null);
  const cooperationStageTotalCount = useMemo(() => countCreatorCooperationStageRows(rows), [rows]);

  useEffect(() => {
    if (!selectedCooperationStage) {
      return;
    }

    const exists = stages.some((stage) => stage.key === selectedCooperationStage);
    if (!exists) {
      setSelectedCooperationStage(null);
    }
  }, [selectedCooperationStage, stages]);

  const selectedCooperationStageRows = useMemo(
    () => resolveSelectedCreatorCooperationStageRows(rows, selectedCooperationStage),
    [rows, selectedCooperationStage]
  );

  return {
    selectedCooperationStage,
    setSelectedCooperationStage,
    cooperationStageTotalCount,
    selectedCooperationStageRows,
  };
}

export interface CreatorAnchorLevelSelectionState<TLevel extends string> {
  selectedAnchorLevel: TLevel | null;
  clearSelectedAnchorLevel: () => void;
  handleAnchorLevelChartClick: (params: unknown) => void;
}

interface UseCreatorAnchorLevelSelectionParams<TLevel extends string, TRow extends CreatorAnchorLevelRow> {
  rows: readonly TRow[];
  normalizeAnchorLevel: (level: string | null) => TLevel | null;
  resolveAnchorLevelFromChartParams: (params: unknown) => TLevel | null;
}

export function useCreatorAnchorLevelSelection<TLevel extends string, TRow extends CreatorAnchorLevelRow>({
  rows,
  normalizeAnchorLevel,
  resolveAnchorLevelFromChartParams,
}: UseCreatorAnchorLevelSelectionParams<TLevel, TRow>): CreatorAnchorLevelSelectionState<TLevel> {
  const [selectedAnchorLevel, setSelectedAnchorLevel] = useState<TLevel | null>(null);
  const clearSelectedAnchorLevel = useCallback(() => setSelectedAnchorLevel(null), []);
  const handleAnchorLevelChartClick = useCallback(
    (params: unknown) => {
      const resolvedLevel = resolveAnchorLevelFromChartParams(params);
      if (!resolvedLevel) {
        return;
      }

      setSelectedAnchorLevel((current) => (current === resolvedLevel ? null : resolvedLevel));
    },
    [resolveAnchorLevelFromChartParams]
  );

  useEffect(() => {
    if (!selectedAnchorLevel) {
      return;
    }

    const hasSelectedLevel = rows.some((row) => normalizeAnchorLevel(row.anchor_level) === selectedAnchorLevel);
    if (!hasSelectedLevel) {
      setSelectedAnchorLevel(null);
    }
  }, [normalizeAnchorLevel, rows, selectedAnchorLevel]);

  return {
    selectedAnchorLevel,
    clearSelectedAnchorLevel,
    handleAnchorLevelChartClick,
  };
}

interface BuildCreatorCooperationStageRowsParams<TKey extends string, TRow> {
  rows: readonly TRow[];
  stages: readonly CreatorCooperationStageMeta<TKey>[];
  resolveStageKey: (row: TRow) => TKey;
  compareRows: (stageKey: TKey, left: TRow, right: TRow) => number;
}

export function buildCreatorCooperationStageRows<TKey extends string, TRow>({
  rows,
  stages,
  resolveStageKey,
  compareRows,
}: BuildCreatorCooperationStageRowsParams<TKey, TRow>): CreatorCooperationStageRows<TKey, TRow>[] {
  const grouped = new Map<TKey, TRow[]>();
  for (const stage of stages) {
    grouped.set(stage.key, []);
  }

  for (const row of rows) {
    const stageKey = resolveStageKey(row);
    const bucket = grouped.get(stageKey) || [];
    bucket.push(row);
    grouped.set(stageKey, bucket);
  }

  return stages.map((stage) => ({
    ...stage,
    rows: (grouped.get(stage.key) || []).slice().sort((left, right) => compareRows(stage.key, left, right)),
  }));
}

export function countCreatorCooperationStageRows<TKey extends string, TRow>(
  stages: readonly CreatorCooperationStageRows<TKey, TRow>[]
): number {
  return stages.reduce((sum, stage) => sum + stage.rows.length, 0);
}

export function resolveSelectedCreatorCooperationStageRows<TKey extends string, TRow>(
  stages: readonly CreatorCooperationStageRows<TKey, TRow>[],
  selectedStage: TKey | null
): TRow[] {
  if (!selectedStage) {
    return stages.flatMap((stage) => stage.rows);
  }
  return stages.find((stage) => stage.key === selectedStage)?.rows || [];
}

export function compareCreatorRowsBySequenceThenName(
  left: CreatorOrderedInfluencerRow,
  right: CreatorOrderedInfluencerRow
): number {
  const leftSequence = toNullableNumber(left.sequence_no);
  const rightSequence = toNullableNumber(right.sequence_no);
  const leftScore = leftSequence === null ? Number.MAX_SAFE_INTEGER : leftSequence;
  const rightScore = rightSequence === null ? Number.MAX_SAFE_INTEGER : rightSequence;

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }
  return (left.influencer_name || '').localeCompare(right.influencer_name || '', 'zh-CN');
}

export function filterCreatorRowsByAnchorLevel<TRow extends CreatorAnchorLevelRow>(
  rows: readonly TRow[],
  selectedAnchorLevel: string | null,
  normalizeAnchorLevel: (level: string | null) => string | null
): TRow[] {
  if (!selectedAnchorLevel) {
    return [];
  }

  return rows
    .filter((row) => normalizeAnchorLevel(row.anchor_level) === selectedAnchorLevel)
    .sort(compareCreatorRowsBySequenceThenName);
}
