import { Empty } from 'antd';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { REPORT_EXPORT_PERMISSIONS } from '@/lib/report-permissions';
import styles from '../marketing.module.css';
import { MarketingPageHero } from './marketing-page-hero';

interface MarketingModuleShellProps {
  title: string;
  description: string;
}

export function MarketingModuleShell({
  title,
  description,
}: MarketingModuleShellProps) {
  return (
    <ProtectedRoute requiredPermission={REPORT_EXPORT_PERMISSIONS} permissionMode="any">
      <Layout>
        <div className={styles.marketingPage}>
          <MarketingPageHero
            backLink={{
              to: '/marketing',
              label: '返回营销总览',
            }}
            eyebrow="Marketing Module"
            title={title}
            description={description}
            noteLabel="当前状态"
            noteText="模块入口、路由和占位骨架已经对齐，这里先保留统一的承接页，后续会按优先级逐步补齐真实数据与操作能力。"
          />

          <section className={styles.placeholderLayout}>
            <article className={styles.placeholderSummary}>
              <p className={styles.placeholderLabel}>模块说明</p>
              <h2 className={styles.placeholderTitle}>{title}正在接入</h2>
              <p className={styles.placeholderDescription}>
                当前阶段先确保结构闭环和入口一致性，避免营销模块仍停留在零散入口或临时页面状态。
              </p>

              <ul className={styles.placeholderList}>
                <li className={styles.placeholderListItem}>
                  <p className={styles.placeholderListTitle}>定位</p>
                  <p className={styles.placeholderListText}>{description}</p>
                </li>
                <li className={styles.placeholderListItem}>
                  <p className={styles.placeholderListTitle}>本轮已完成</p>
                  <p className={styles.placeholderListText}>导航入口、总览层级、模块占位页样式和返回路径已统一。</p>
                </li>
                <li className={styles.placeholderListItem}>
                  <p className={styles.placeholderListTitle}>下一步</p>
                  <p className={styles.placeholderListText}>在当前承接页基础上补齐真实数据、筛选能力与业务工作流。</p>
                </li>
              </ul>
            </article>

            <div className={styles.placeholderEmptySurface}>
              <Empty description={`${title}功能开发中...`} />
            </div>
          </section>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
