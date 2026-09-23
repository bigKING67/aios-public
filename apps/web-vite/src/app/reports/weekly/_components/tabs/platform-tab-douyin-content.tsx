import type {
  DouyinAttributionSectionPropsBundle,
} from './platform-tab-douyin-attribution-section-contracts';
import { DouyinAttributionSections } from './platform-tab-douyin-sections';

export function PlatformTabDouyinContent(props: DouyinAttributionSectionPropsBundle) {
  return <DouyinAttributionSections {...props} />;
}
