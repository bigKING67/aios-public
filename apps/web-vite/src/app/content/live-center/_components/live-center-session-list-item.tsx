import {
  formatBusinessDateTime,
  formatDurationMinutes,
  formatInteger,
} from '../_lib/live-center-formatters';
import type { LiveCenterSession } from '../_lib/live-center-types';
import { isActivationKey } from '../_lib/live-center-view-helpers';
import styles from '../live-center.module.css';

export function LiveCenterSessionListItem({
  isSelected,
  session,
  onSelectSession,
}: {
  isSelected: boolean;
  session: LiveCenterSession;
  onSelectSession: (sessionId: string) => void;
}) {
  const itemClassName = mergeClassNames(
    styles.sessionQueueItem,
    isSelected ? styles.sessionQueueItemSelected : null,
    hasLiveOrders(session) ? styles.sessionQueueItemConverted : null
  );

  return (
    <div className={styles.sessionQueueListItem} role="listitem">
      <button
        aria-pressed={isSelected}
        className={itemClassName}
        type="button"
        onClick={() => onSelectSession(session.sessionId)}
        onKeyDown={(event) => {
          if (!isActivationKey(event)) {
            return;
          }
          event.preventDefault();
          onSelectSession(session.sessionId);
        }}
      >
        <div className={styles.sessionQueueItemHeader}>
          <div className={styles.sessionIdentityText}>
            <strong
              title={[
                session.anchorNickname || '未知主播',
                session.shopName || session.shopId || '',
              ].filter(Boolean).join(' · ')}
            >
              {session.anchorNickname || '未知主播'}
            </strong>
          </div>
        </div>
        <dl
          className={styles.sessionQueueMetrics}
          aria-label={[
            `直播开始时间：${formatBusinessDateTime(session.liveStartTime)}`,
            `直播时长：${formatDurationMinutes(session.liveDurationMinutes)}`,
            `成交订单：${formatInteger(session.liveOrderCount)}`,
          ].join('，')}
        >
          <div>
            <dt>开始时间</dt>
            <dd>{formatBusinessDateTime(session.liveStartTime)}</dd>
          </div>
          <div>
            <dt>直播时长</dt>
            <dd>{formatDurationMinutes(session.liveDurationMinutes)}</dd>
          </div>
          <div>
            <dt>成交订单</dt>
            <dd className={resolveOrderCountClassName(session.liveOrderCount)}>
              {formatInteger(session.liveOrderCount)} 单
            </dd>
          </div>
        </dl>
      </button>
    </div>
  );
}

function hasLiveOrders(session: LiveCenterSession): boolean {
  return typeof session.liveOrderCount === 'number' && session.liveOrderCount > 0;
}

function resolveOrderCountClassName(value: LiveCenterSession['liveOrderCount']): string {
  return typeof value === 'number' && value > 0
    ? `${styles.numericText} ${styles.positiveOrderText}`
    : styles.numericText;
}

function mergeClassNames(...classNames: Array<string | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}
