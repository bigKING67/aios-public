import { memo, useMemo } from 'react';
import { Button, Drawer, Tag, Tooltip } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LinkOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatRelativeFromNow,
  trimText,
} from '../_lib/industry-news-formatters';
import type {
  IndustryArticleItem,
  IndustryArticleSource,
  IndustryArticleSummary,
} from '../_lib/industry-news-types';
import styles from '../industry-news-panels.module.css';
import type { FeedDensity } from './industry-news-model';
import { resolveWechatStatusLabel } from './industry-news-model';

export function MetricStrip({ summary }: { summary: IndustryArticleSummary }) {
  const metrics = [
    {
      label: '可读文章',
      value: formatCompactNumber(summary.totalArticles),
      note: `${formatCompactNumber(summary.sourceCount)} 个来源`,
    },
    {
      label: '今日发布',
      value: formatCompactNumber(summary.todayArticles),
      note: `最新 ${formatDateTime(summary.latestPublishTime)}`,
    },
    {
      label: '待补/不可读',
      value: formatCompactNumber(summary.listOnlyArticles),
      note: '仅列表或正文不足',
    },
    {
      label: '正文失败',
      value: formatCompactNumber(summary.failedContentArticles),
      note: '见右侧来源状态',
    },
    {
      label: '已抓正文',
      value: formatCompactNumber(summary.contentFetchedArticles),
      note: '进入读者资讯流',
    },
    {
      label: '异常来源',
      value: formatCompactNumber(summary.failedSourceCount),
      note: `同步 ${formatRelativeFromNow(summary.latestFetchedAt)}`,
    },
  ];

  return (
    <div className={styles.metricStrip}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.metricItem}>
          <p className={styles.metricLabel}>{metric.label}</p>
          <span className={styles.metricValue}>{metric.value}</span>
          <p className={styles.metricNote}>{metric.note}</p>
        </div>
      ))}
    </div>
  );
}

export function WechatStatusPanel({ summary }: { summary: IndustryArticleSummary }) {
  const status = summary.wechatLoginStatus ?? 'unknown';
  const isHealthy = status === 'ok';
  const title = isHealthy ? '微信登录状态正常' : '微信登录需要关注';
  const expiresAt = formatDateTime(summary.wechatLoginExpiresAt);

  return (
    <div className={`${styles.statusPanel} ${isHealthy ? '' : styles.statusPanelDanger}`}>
      <div className={styles.statusMain}>
        {isHealthy ? (
          <CheckCircleOutlined className={styles.statusIcon} />
        ) : (
          <WarningOutlined className={styles.statusIcon} />
        )}
        <div>
          <p className={styles.statusTitle}>{title}</p>
          <p className={styles.statusMeta}>状态：{resolveWechatStatusLabel(status)}；过期时间：{expiresAt}</p>
        </div>
      </div>
      <Tag color={isHealthy ? 'success' : 'error'}>{resolveWechatStatusLabel(status)}</Tag>
    </div>
  );
}

export const ArticleListItem = memo(function ArticleListItem({
  item,
  density,
  onOpen,
}: {
  item: IndustryArticleItem;
  density: FeedDensity;
  onOpen: (item: IndustryArticleItem) => void;
}) {
  const compact = density === 'compact';
  const digest = useMemo(() => trimText(item.digest, 160), [item.digest]);
  const excerpt = useMemo(
    () => trimText(item.plainContent || item.digest, compact ? 140 : 260),
    [compact, item.digest, item.plainContent]
  );
  const openArticle = () => onOpen(item);

  return (
    <article
      className={`${styles.articleItem} ${compact ? styles.articleItemCompact : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`打开文章详情：${item.title}`}
      onClick={openArticle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openArticle();
        }
      }}
    >
      <div className={styles.articleMain}>
        <div className={styles.articleMeta}>
          <span className={styles.sourceName}>{item.sourceNickname || item.sourceAlias || '未知来源'}</span>
          <span>{formatDate(item.publishDate)}</span>
          <span>{formatRelativeFromNow(item.fetchedAt)}</span>
        </div>
        <h3 className={styles.articleTitle}>{item.title}</h3>
        {digest ? <p className={styles.articleDigest}>{digest}</p> : null}
        {excerpt ? <p className={styles.articleExcerpt}>{excerpt}</p> : null}
        <div className={styles.articleFooter}>
          <Tag color="success">可读正文</Tag>
          {item.imageCount > 0 ? <Tag icon={<FileTextOutlined />}>{item.imageCount} 图</Tag> : null}
        </div>
      </div>
      <Cover item={item} />
    </article>
  );
});

function Cover({ item }: { item: IndustryArticleItem }) {
  return (
    <div className={styles.coverWrap}>
      {item.coverUrl ? (
        <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className={styles.coverFallback}>
          <CalendarOutlined />
        </div>
      )}
    </div>
  );
}

export function SourcePanel({
  sources,
  loading = false,
  error = false,
  staleError = false,
  selectedSourceFakeid,
  onSelectSource,
}: {
  sources: IndustryArticleSource[];
  loading?: boolean;
  error?: boolean;
  staleError?: boolean;
  selectedSourceFakeid?: string;
  onSelectSource: (sourceFakeid: string | undefined) => void;
}) {
  const sourceHint = error
    ? '来源加载失败，可刷新页面重试'
    : loading
      ? '正在加载来源列表'
      : staleError
        ? '来源刷新失败，当前显示最近一次来源列表'
      : '按来源筛选资讯流';

  return (
    <aside className={styles.sourcePanel} aria-labelledby="industry-news-source-title">
      <div className={styles.sourceHeader}>
        <div>
          <h2 id="industry-news-source-title" className={styles.sourceTitle}>
            订阅来源
          </h2>
          <p className={styles.sourceHint}>{sourceHint}</p>
        </div>
        <Tag>{loading ? '加载中' : `${formatCompactNumber(sources.length)} 个`}</Tag>
      </div>
      <div className={styles.sourceList}>
        {loading ? (
          <div className={styles.sourceEmpty} role="status" aria-live="polite">
            正在加载订阅来源...
          </div>
        ) : null}
        {!loading && error ? (
          <div className={`${styles.sourceEmpty} ${styles.sourceEmptyError}`} role="alert">
            订阅来源加载失败，请刷新页面重试
          </div>
        ) : null}
        {!loading && !error && sources.length === 0 ? (
          <div className={styles.sourceEmpty}>暂无订阅来源</div>
        ) : null}
        {!loading && !error ? sources.map((source) => {
          const selected = source.sourceFakeid === selectedSourceFakeid;
          const sourceName = source.nickname || source.alias || source.sourceFakeid;
          return (
            <button
              key={source.sourceFakeid}
              type="button"
              className={`${styles.sourceItem} ${selected ? styles.sourceItemActive : ''}`}
              aria-label={`${selected ? '取消来源筛选' : '按来源筛选'}：${sourceName}`}
              aria-pressed={selected}
              onClick={() => onSelectSource(selected ? undefined : source.sourceFakeid)}
            >
              <div className={styles.sourceTop}>
                {source.headImgUrl ? (
                  <img
                    className={styles.sourceAvatar}
                    src={source.headImgUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={styles.sourceAvatar} />
                )}
                <div className={styles.sourceInfo}>
                  <span className={styles.sourceNickname}>{sourceName}</span>
                  <span className={styles.sourceSub}>{source.categoryName || source.sourceFakeid}</span>
                </div>
              </div>
              <div className={styles.sourceStats}>
                <div className={styles.sourceStat}>
                  <span className={styles.sourceStatLabel}>可读</span>
                  <span className={styles.sourceStatValue}>{formatCompactNumber(source.articleCount)}</span>
                </div>
                <div className={styles.sourceStat}>
                  <span className={styles.sourceStatLabel}>待补/不足</span>
                  <span className={styles.sourceStatValue}>{formatCompactNumber(source.pendingContentCount)}</span>
                </div>
                <div className={styles.sourceStat}>
                  <span className={styles.sourceStatLabel}>失败</span>
                  <span className={styles.sourceStatValue}>{formatCompactNumber(source.failedContentCount)}</span>
                </div>
                <div className={styles.sourceStat}>
                  <span className={styles.sourceStatLabel}>同步</span>
                  <span className={styles.sourceStatValue}>{formatRelativeFromNow(source.lastSuccessAt)}</span>
                </div>
              </div>
              {source.lastError ? (
                <Tooltip title={source.lastError}>
                  <Tag color="error">连续失败 {source.consecutiveFailures}</Tag>
                </Tooltip>
              ) : source.failedContentCount > 0 ? (
                <Tooltip title={source.lastContentError || '存在正文抓取失败，文章已从读者资讯流隐藏'}>
                  <Tag color="warning">正文失败 {formatCompactNumber(source.failedContentCount)}</Tag>
                </Tooltip>
              ) : source.pendingContentCount > 0 ? (
                <Tag color="processing">待补/不足 {formatCompactNumber(source.pendingContentCount)}</Tag>
              ) : (
                <Tag color={source.enabled ? 'success' : 'default'}>
                  {source.enabled ? '启用' : '停用'}
                </Tag>
              )}
            </button>
          );
        }) : null}
      </div>
    </aside>
  );
}

export function ArticleDrawer({
  item,
  open,
  onClose,
}: {
  item: IndustryArticleItem | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      width="min(620px, calc(100vw - 24px))"
      title="文章详情"
      open={open}
      onClose={onClose}
      extra={
        item ? (
          <Button
            href={item.articleUrl}
            target="_blank"
            rel="noreferrer"
            icon={<LinkOutlined />}
            disabled={!item.articleUrl}
          >
            打开原文
          </Button>
        ) : null
      }
    >
      {item ? (
        <>
          {item.coverUrl ? (
            <div className={styles.drawerCover}>
              <img src={item.coverUrl} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : null}
          <div className={styles.drawerMeta}>
            <h2 className={styles.drawerTitle}>{item.title}</h2>
            <div className={styles.articleMeta}>
              <span className={styles.sourceName}>{item.sourceNickname || item.sourceAlias}</span>
              <span>{formatDateTime(item.publishTime)}</span>
            </div>
            {item.digest ? <p className={styles.articleDigest}>{item.digest}</p> : null}
          </div>
          <p className={styles.drawerParagraph}>
            {item.plainContent || '正文缓存为空。'}
          </p>
        </>
      ) : null}
    </Drawer>
  );
}
