import { Empty } from 'antd';
import type { ContentAssetDetailResponse } from '../_lib/content-assets-types';
import { formatDateTime } from '../_lib/content-assets-formatters';
import inspectorStyles from './content-assets-inspector.module.css';

export function EventsTab({ detail }: { detail: ContentAssetDetailResponse | null }) {
  const events = detail?.events || [];
  return (
    <div className={inspectorStyles.eventList}>
      {events.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作日志" /> : null}
      {events.map((event) => (
        <article key={event.eventId} className={inspectorStyles.eventItem}>
          <strong>{event.eventType}</strong>
          <span>{formatDateTime(event.createdAt)}</span>
          <p>{event.message || '--'}</p>
        </article>
      ))}
    </div>
  );
}
