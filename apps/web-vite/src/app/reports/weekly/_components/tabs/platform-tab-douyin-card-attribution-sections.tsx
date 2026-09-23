import { DouyinCardProductAttributionSection } from './platform-tab-douyin-card-product-section';
import type {
  DouyinCardAttributionSectionsProps,
} from './platform-tab-douyin-card-section-contracts';
import { DouyinCardSourceAttributionSection } from './platform-tab-douyin-card-source-section';
import { DouyinCardSourceFunnelSection } from './platform-tab-douyin-card-source-funnel-section';

export function DouyinCardAttributionSections({
  subsectionList,
  productSectionProps,
  sourceSectionProps,
  funnelSectionProps,
}: DouyinCardAttributionSectionsProps) {
  return (
    <>
      {subsectionList.map((section) => {
        if (section.kind === 'product') {
          return (
            <DouyinCardProductAttributionSection
              key={section.kind}
              {...productSectionProps}
            />
          );
        }

        if (section.kind === 'source') {
          return (
            <DouyinCardSourceAttributionSection
              key={section.kind}
              {...sourceSectionProps}
            />
          );
        }

        return (
          <DouyinCardSourceFunnelSection
            key={section.kind}
            {...funnelSectionProps}
          />
        );
      })}
    </>
  );
}
