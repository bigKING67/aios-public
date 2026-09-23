import { Link } from 'react-router-dom';
import { CalendarOutlined, HomeOutlined } from '@ant-design/icons';
import { Empty } from 'antd';
import styles from './creator-dashboard.module.css';
import targetStyles from './creator-target-list-shell.module.css';
import { CREATOR_DASHBOARD_TABS, type CreatorDashboardTabKey } from './creator-tabs';

type MetricCardItem = {
  label: string;
  value: string;
  trend: string;
};

type CreatorDashboardPageCopy = {
  title: string;
  subtitle: string;
  metrics: readonly MetricCardItem[];
  listTitle: string;
  listDescription: string;
};

interface CreatorDashboardShellProps {
  activeTab: CreatorDashboardTabKey;
}

const MODE_OPTIONS = ['月', '周', '日', '年', '自定义'] as const;

const PAGE_COPY_MAP: Record<CreatorDashboardTabKey, CreatorDashboardPageCopy> = {
  live: {
    title: '直播带货达人',
    subtitle: '以直播场次、转化与成交表现组织达人看板，保持与经营看板一致的阅读节奏。',
    metrics: [
      { label: '直播GMV', value: '¥0', trend: '+0.00%  较上期' },
      { label: '直播成交人数', value: '0', trend: '+0.00%  较上期' },
      { label: '场均转化率', value: '0.00%', trend: '+0.00%  较上期' },
    ],
    listTitle: '直播带货达人列表',
    listDescription: '当前阶段先完成布局与结构，占位区后续接入达人实时数据与筛选能力。',
  },
  'short-video': {
    title: '短视频挂车达人',
    subtitle: '围绕挂车内容的播放、点击与成交效率组织看板，便于快速判断内容转化质量。',
    metrics: [
      { label: '挂车GMV', value: '¥0', trend: '+0.00%  较上期' },
      { label: '挂车成交人数', value: '0', trend: '+0.00%  较上期' },
      { label: '挂车转化率', value: '0.00%', trend: '+0.00%  较上期' },
    ],
    listTitle: '短视频挂车达人列表',
    listDescription: '将接入内容级与达人级的挂车表现数据，支持后续筛选、排序与协同跟进。',
  },
  'target-list': {
    title: '目标达人列表',
    subtitle: '沉淀候选达人池与跟进状态，统一查看目标名单并支持协同分配。',
    metrics: [
      { label: '目标达人数', value: '0', trend: '+0.00%  较上期' },
      { label: '本周跟进数', value: '0', trend: '+0.00%  较上期' },
      { label: '合作转化率', value: '0.00%', trend: '+0.00%  较上期' },
    ],
    listTitle: '目标达人名单',
    listDescription: '结构已就绪，后续接入名单字段、状态管理与跨团队协同动作。',
  },
};

export function CreatorDashboardShell({ activeTab }: CreatorDashboardShellProps) {
  const pageCopy = PAGE_COPY_MAP[activeTab];

  return (
    <div className={styles.pageRoot}>
      <div className={styles.backdropGlow} aria-hidden />
      <div className={styles.surface}>
        <header className={styles.topBar}>
          <div className={styles.brandBlock}>
            <Link
              to="/"
              className={styles.homeEntryLink}
              aria-label="返回首页"
              title="返回首页"
            >
              <HomeOutlined className={styles.homeEntryIcon} />
            </Link>
            <div className={styles.brand}>Groland Shopping Influencer</div>
          </div>

          <nav className={styles.tabRail} aria-label="带货达人看板页面切换">
            {CREATOR_DASHBOARD_TABS.map((tab) => {
              const className =
                activeTab === tab.key
                  ? `${styles.tabButton} ${styles.tabButtonActive}`
                  : styles.tabButton;
              return (
                <Link key={tab.key} to={tab.href} className={className}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className={styles.filters}>
            <div className={styles.tabRail} aria-label="时间模式">
              {MODE_OPTIONS.map((item, index) => (
                <span
                  key={item}
                  className={
                    index === 0
                      ? `${styles.tabButton} ${styles.tabButtonActive}`
                      : styles.tabButton
                  }
                >
                  {item}
                </span>
              ))}
            </div>
            <div className={targetStyles.dateSurface} aria-label="时间选择">
              <span>2026/03</span>
              <CalendarOutlined />
            </div>
          </div>
        </header>

        <main className={`${styles.dashboardContent} ${targetStyles.dashboardFill}`}>
          <section className={targetStyles.pageIntro}>
            <div className={styles.dimensionPlaceholderHeader}>
              <p className={styles.pageEyebrow}>Shopping Influencer Board</p>
              <h3>{pageCopy.title}</h3>
              <p>{pageCopy.subtitle}</p>
            </div>
          </section>

          <section className={styles.metricGrid}>
            {pageCopy.metrics.map((item) => (
              <article key={item.label} className={styles.metricCard}>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span className={targetStyles.metricTrend}>{item.trend}</span>
              </article>
            ))}
          </section>

          <section className={styles.chartLayout}>
            <article className={styles.chartPanel}>
              <header className={styles.chartHead}>
                <div className={styles.chartHeadMain}>
                  <h3>{pageCopy.title}月趋势</h3>
                  <p>按月观察核心指标变化，后续接入真实序列数据。</p>
                </div>
              </header>
              <div className={targetStyles.trendPlaceholder} aria-hidden>
                <div className={targetStyles.trendGrid} />
                <div className={targetStyles.trendLine} />
                <div className={targetStyles.trendAxis}>
                  <span>第1周</span>
                  <span>第2周</span>
                  <span>第3周</span>
                  <span>第4周</span>
                  <span>第5周</span>
                </div>
              </div>
            </article>

            <article className={styles.chartPanel}>
              <header className={styles.chartHead}>
                <div className={styles.chartHeadMain}>
                  <h3>平台占比</h3>
                  <p>当前周期平台占比（占位视图）。</p>
                </div>
              </header>
              <div className={targetStyles.sharePlaceholder} aria-hidden>
                <div className={targetStyles.shareDonut} />
              </div>
            </article>
          </section>

          <section className={styles.chartPanel}>
            <header className={styles.chartHead}>
              <div className={styles.chartHeadMain}>
                <h3>{pageCopy.listTitle}</h3>
                <p>{pageCopy.listDescription}</p>
              </div>
              <Link to="/dashboard" className={targetStyles.backToBusinessLink}>
                返回经营看板
              </Link>
            </header>
            <div className={targetStyles.emptySurface}>
              <Empty description={`${pageCopy.title} 数据接入中...`} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
