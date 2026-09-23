import type {
  DouyinShortvideoAnalysisSectionProps,
} from './platform-tab-douyin-shortvideo-leaf-contracts';
import type { DouyinShortvideoRow } from './platform-tab-types';
import {
  WeeklyAttributionGrid,
  WeeklyAttributionTableCard,
  WeeklyBlock,
  WeeklyDataTable,
  WeeklyDiagnosisCard,
  WeeklyEmptyState,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinShortvideoAnalysisSection({
  selectedAuthorNickname,
  diagnosisCardProps,
  tableProps,
}: DouyinShortvideoAnalysisSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`GMV波动归因 · 短视频 · ${selectedAuthorNickname} · 内容分析`}
        description="当前短视频链路按可用字段输出诊断原因与执行动作，漏斗行为数据待后续补齐。"
      />
      {diagnosisCardProps && tableProps ? (
        <WeeklyAttributionGrid>
          <WeeklyDiagnosisCard
            {...diagnosisCardProps}
          />
          <WeeklyAttributionTableCard>
            <WeeklyDataTable<DouyinShortvideoRow>
              {...tableProps}
            />
          </WeeklyAttributionTableCard>
        </WeeklyAttributionGrid>
      ) : (
        <WeeklyEmptyState description="暂无可分析短视频内容" />
      )}
    </WeeklyBlock>
  );
}
