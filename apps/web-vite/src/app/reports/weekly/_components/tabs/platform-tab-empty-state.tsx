import { WeeklyBlock, WeeklyEmptyState } from './weekly-primitives';

export function PlatformTabEmptyState() {
  return (
    <WeeklyBlock>
      <WeeklyEmptyState description="该平台暂无可展示数据" />
    </WeeklyBlock>
  );
}
