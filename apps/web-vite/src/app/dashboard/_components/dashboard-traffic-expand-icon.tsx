import type { MouseEvent } from 'react';

import tableStyles from './dashboard-traffic-table.module.css';

type DashboardTrafficExpandIconProps<RecordType extends object> = {
  expanded: boolean;
  expandable: boolean;
  record: RecordType;
  onExpand: (record: RecordType, event: MouseEvent<HTMLElement>) => void;
};

export function renderDashboardTrafficExpandIcon<RecordType extends object>({
  expanded,
  expandable,
  record,
  onExpand,
}: DashboardTrafficExpandIconProps<RecordType>) {
  const className = [
    tableStyles.trafficExpandIcon,
    expanded ? tableStyles.trafficExpandIconExpanded : '',
    expandable ? '' : tableStyles.trafficExpandIconPlaceholder,
  ]
    .filter(Boolean)
    .join(' ');

  if (!expandable) {
    return <span className={className} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={expanded ? '收起流量来源' : '展开流量来源'}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onExpand(record, event);
      }}
    />
  );
}
