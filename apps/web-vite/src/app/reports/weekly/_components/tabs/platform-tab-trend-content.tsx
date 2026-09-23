import { PlatformTrendSection } from './platform-trend-section';
import type {
  PlatformTrendSectionPropsBundle,
} from './platform-tab-trend-section-contracts';

export function PlatformTabTrendContent(props: PlatformTrendSectionPropsBundle) {
  return <PlatformTrendSection {...props} />;
}
