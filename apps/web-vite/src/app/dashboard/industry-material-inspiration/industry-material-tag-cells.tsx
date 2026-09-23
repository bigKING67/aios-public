import {
  isMediumSellingPointTag,
  isWideSellingPointTag,
  resolveTagGroupCell,
} from './industry-material-tag-layout';
import type { TagCellVariant } from './industry-material-tag-layout';
import tableCellStyles from './industry-material-table-cells.module.css';

function TagGroupCell({
  value,
  variant,
}: {
  value: string;
  variant: TagCellVariant;
}) {
  const isAudience = variant === 'audience';
  const { hiddenTags, tags, visibleRows } = resolveTagGroupCell(value, variant);
  const hasVisibleTags = visibleRows.some((rowTags) => rowTags.length > 0);
  const hiddenCount = hiddenTags.length;
  const hiddenTitle = hiddenTags.join(' / ');
  const title = tags.length ? tags.join(' / ') : value;

  if (!hasVisibleTags && hiddenCount === 0) {
    return (
      <span className={tableCellStyles.mutedText} title={value}>
        {value}
      </span>
    );
  }

  return (
    <div
      className={[
        tableCellStyles.tagGroupCell,
        isAudience ? tableCellStyles.audienceTagGroup : tableCellStyles.sellingPointTagGroup,
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
    >
      {visibleRows.map((rowTags, rowIndex) => (
        <div className={tableCellStyles.tagRow} key={rowIndex === 0 ? 'primary' : 'secondary'}>
          {rowTags.map((tag) => {
            const mediumSellingPointTag = !isAudience && isMediumSellingPointTag(tag);
            const wideSellingPointTag = !isAudience && isWideSellingPointTag(tag);
            const hasMoreOnThisRow = rowIndex === 1 && hiddenCount > 0;
            const tagClassName = [
              tableCellStyles.tagChip,
              mediumSellingPointTag ? tableCellStyles.tagChipMedium : '',
              wideSellingPointTag ? tableCellStyles.tagChipWide : '',
              wideSellingPointTag && hasMoreOnThisRow ? tableCellStyles.tagChipWideWithMore : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <span className={tagClassName} key={tag} title={tag}>
                {tag}
              </span>
            );
          })}
          {rowIndex === 1 && hiddenCount > 0 ? (
            <span className={tableCellStyles.moreTagChip} title={hiddenTitle || title}>
              +{hiddenCount}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AudienceTagCell({ value }: { value: string }) {
  return <TagGroupCell value={value} variant="audience" />;
}

export function SellingPointTagCell({ value }: { value: string }) {
  return <TagGroupCell value={value} variant="sellingPoint" />;
}
