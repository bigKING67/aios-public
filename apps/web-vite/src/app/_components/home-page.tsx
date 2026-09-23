/**
 * 首页
 *
 * 说明：当前前端运行时为 Vite + React Router，页面保持无本地交互状态。
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import {
  ApiOutlined,
  BranchesOutlined,
  DesktopOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { Layout } from '@/components/organisms/layout';
import '../page-materials.css';
import styles from '../page.module.css';
import heroStyles from '../page-hero.module.css';

interface Capability {
  title: string;
  description: string;
  icon: ReactNode;
  featured?: boolean;
}

interface Entry {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  priority?: 'primary' | 'secondary';
}

interface HeroFeature {
  title: string;
  description: string;
  mobileShort: string;
}

const capabilityItems: Capability[] = [
  {
    title: '可视化经营看板',
    description: '以图表与结构化摘要呈现经营状态，便于管理层统一判断与协同推进。',
    icon: <DesktopOutlined />,
    featured: true,
  },
  {
    title: '多平台经营报告',
    description: '汇总核心指标，查看同比、环比与异常。',
    icon: <FileTextOutlined />,
  },
  {
    title: '趋势追踪与预警',
    description: '跟踪 GMV、流量与转化效率，识别增长拐点。',
    icon: <ReloadOutlined />,
  },
  {
    title: '数据运维闭环',
    description: '统一管理 ETL 编排、数据同步和告警通知。',
    icon: <ApiOutlined />,
  },
  {
    title: '营销协同与触达',
    description: '沉淀投放策略、转化复盘与协同执行入口。',
    icon: <BranchesOutlined />,
  },
];

const entryItems: Entry[] = [
  {
    id: 'dashboard',
    title: '数据看板',
    description: '查看核心指标与趋势，快速总览经营状态。',
    href: '/dashboard',
    actionLabel: '进入看板',
    priority: 'primary',
  },
  {
    id: 'weekly-report',
    title: '周报中心',
    description: '按周复盘平台波动与关键异常。',
    href: '/reports/weekly',
    actionLabel: '查看周报',
  },
  {
    id: 'monthly-report',
    title: '月报中心',
    description: '沉淀月度结论与策略表现。',
    href: '/reports/monthly',
    actionLabel: '查看月报',
  },
  {
    id: 'dataops',
    title: '数据运维中心',
    description: '统一管理 ETL 链路与通知配置。',
    href: '/ops/dataops',
    actionLabel: '进入运维',
  },
];

const heroFeatureItems: HeroFeature[] = [
  {
    title: '经营数据统一入口',
    description: '看板、周报、月报与运维统一编排，减少切换成本。',
    mobileShort: '看板、报表与运维统一入口。',
  },
  {
    title: '趋势洞察与风险预警',
    description: '跟踪核心指标波动，快速定位异常来源。',
    mobileShort: '指标波动可一眼定位异常。',
  },
  {
    title: '标准化汇报输出',
    description: '统一摘要结构与复盘口径，提升同步效率。',
    mobileShort: '摘要结构统一，复盘同步更高效。',
  },
  {
    title: 'AI+分析',
    description: 'AI 辅助经营解读与异常归因，加快决策闭环。',
    mobileShort: 'AI 辅助解读异常与经营变化。',
  },
];

export function HomePage() {
  return (
    <Layout>
      <div className={styles.homeShell}>
        <section className={heroStyles.hero}>
          <div className={heroStyles.heroBackdrop} aria-hidden />
          <div className={heroStyles.heroGrid} aria-hidden />
          <div className={`${heroStyles.glowOrb} ${heroStyles.glowOrbLeft}`} aria-hidden />
          <div className={`${heroStyles.glowOrb} ${heroStyles.glowOrbRight}`} aria-hidden />
          <div className={`${heroStyles.ring} ${heroStyles.ringOne}`} aria-hidden />
          <div className={`${heroStyles.ring} ${heroStyles.ringTwo}`} aria-hidden />

          <div className={heroStyles.heroContent}>
            <div className={heroStyles.heroTag}>AI-DRIVEN BUSINESS PRODUCTIVITY</div>
            <h1 className={heroStyles.heroTitle}>Groland AIOS</h1>
            <p className={heroStyles.heroLead}>AI 驱动的业务生产力系统</p>

            <div className={heroStyles.heroActions}>
              <Button type="primary" size="large" href="/dashboard" className={heroStyles.primaryAction}>
                进入看板
              </Button>
              <Link to="/docs" className={heroStyles.secondaryAction}>
                文档中心
              </Link>
            </div>

            <dl className={heroStyles.metricRow} aria-label="首页能力概览">
              <div className={heroStyles.metricItem}>
                <dt className={heroStyles.metricLabel}>指标维度</dt>
                <dd className={heroStyles.metricValue}>12+</dd>
              </div>
              <div className={heroStyles.metricItem}>
                <dt className={heroStyles.metricLabel}>功能板块</dt>
                <dd className={heroStyles.metricValue}>4+</dd>
              </div>
              <div className={heroStyles.metricItem}>
                <dt className={heroStyles.metricLabel}>汇报标准</dt>
                <dd className={heroStyles.metricValue}>1</dd>
              </div>
            </dl>
          </div>

          <aside className={heroStyles.heroPanel}>
            <h2 className={heroStyles.panelTitle}>AIOS 主要功能</h2>
            <div className={heroStyles.panelList}>
              {heroFeatureItems.map((item) => (
                <div key={item.title} className={heroStyles.panelItem}>
                  <span className={heroStyles.panelDot} />
                  <div>
                    <p className={heroStyles.panelItemTitle}>{item.title}</p>
                    <p className={heroStyles.panelItemDesc}>
                      <span className={heroStyles.panelItemDescDesktop}>{item.description}</span>
                      <span className={heroStyles.panelItemDescMobile}>{item.mobileShort}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className={`${styles.sectionBlock} ${styles.sectionBlockCapability}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCapability}`}>核心能力矩阵</h2>
              <p className={styles.sectionDesc}>经营、报告、运维和智能分析聚合为同一套工作台能力。</p>
            </div>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilityItems.map((item) => (
              <article
                key={item.title}
                className={`${styles.capabilityCard} ${item.featured ? styles.capabilityCardPrimary : ''}`}
              >
                <div className={styles.capabilityIcon}>{item.icon}</div>
                <h3 className={styles.capabilityTitle}>{item.title}</h3>
                <p className={styles.capabilityDesc}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.sectionBlock} ${styles.sectionBlockEntry}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleEntry}`}>快速入口</h2>
              <p className={styles.sectionDesc}>高频路径直接进入，减少在模块之间反复寻找。</p>
            </div>
          </div>
          <div className={styles.entryGrid}>
            {entryItems.map((item) => {
              const titleId = `${item.id}-title`;
              const descId = `${item.id}-desc`;

              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={`${styles.entryCard} ${item.priority === 'primary' ? styles.entryCardPrimary : ''}`}
                  aria-labelledby={titleId}
                  aria-describedby={descId}
                >
                  <div className={styles.entryCardContent}>
                    <h3 id={titleId} className={styles.entryTitle}>
                      {item.title}
                    </h3>
                    <p id={descId} className={styles.entryDesc}>
                      {item.description}
                    </p>
                  </div>
                  <span className={styles.entryAction} aria-hidden="true">
                    {item.actionLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className={`${styles.sectionBlock} ${styles.sectionBlockGovernance}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleGovernance}`}>平台治理保障</h2>
              <p className={styles.sectionDesc}>权限与审计作为底层约束，保障经营数据可信可追踪。</p>
            </div>
          </div>
          <div className={styles.governanceGrid}>
            <article className={styles.governanceItem}>
              <div>
                <div className={styles.governanceHeader}>
                  <div className={styles.governanceIcon}>
                    <SafetyOutlined />
                  </div>
                  <h3 className={styles.governanceTitle}>权限分层</h3>
                </div>
                <p className={styles.governanceDesc}>按角色控制数据可见范围，管理视图与执行视图分层呈现。</p>
              </div>
            </article>
            <article className={styles.governanceItem}>
              <div>
                <div className={styles.governanceHeader}>
                  <div className={styles.governanceIcon}>
                    <FileSearchOutlined />
                  </div>
                  <h3 className={styles.governanceTitle}>审计追踪</h3>
                </div>
                <p className={styles.governanceDesc}>关键访问与操作可回溯，便于复盘数据来源与决策路径。</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </Layout>
  );
}
