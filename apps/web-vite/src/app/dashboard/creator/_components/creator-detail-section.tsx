'use client';

import shellStyles from './creator-dashboard.module.css';
import { CreatorDetailHeader, type CreatorDetailHeaderProps } from './creator-detail-header';
import {
  CreatorDetailTable,
  type CreatorDetailTableProps,
  type CreatorDetailTableRecord,
} from './creator-detail-table';

export interface CreatorDetailSectionProps<TRecord extends CreatorDetailTableRecord>
  extends CreatorDetailHeaderProps {
  columns: CreatorDetailTableProps<TRecord>['columns'];
  dataSource: CreatorDetailTableProps<TRecord>['dataSource'];
  loading: CreatorDetailTableProps<TRecord>['loading'];
  scrollX: CreatorDetailTableProps<TRecord>['scrollX'];
  scrollY?: CreatorDetailTableProps<TRecord>['scrollY'];
  emptyText?: CreatorDetailTableProps<TRecord>['emptyText'];
  paginationNote?: CreatorDetailTableProps<TRecord>['paginationNote'];
  rowClassName?: CreatorDetailTableProps<TRecord>['rowClassName'];
}

export function CreatorDetailSection<TRecord extends CreatorDetailTableRecord>({
  columns,
  dataSource,
  loading,
  scrollX,
  scrollY,
  emptyText,
  paginationNote,
  rowClassName,
  ...headerProps
}: CreatorDetailSectionProps<TRecord>) {
  return (
    <section className={shellStyles.chartPanel}>
      <CreatorDetailHeader {...headerProps} />
      <CreatorDetailTable<TRecord>
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        scrollX={scrollX}
        scrollY={scrollY}
        emptyText={emptyText}
        paginationNote={paginationNote}
        rowClassName={rowClassName}
      />
    </section>
  );
}
