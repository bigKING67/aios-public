import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { canAccessPath } from '@/lib/auth-navigation';
import { useAuthStore } from '@/stores/auth.store';
import styles from '../marketing.module.css';
import { MarketingModuleCard } from './marketing-module-card';
import { MarketingPageHero } from './marketing-page-hero';
import { MARKETING_MODULES } from './marketing-workspace-data';

export function MarketingPageContent() {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.user?.roles || []);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const routeAccessIdentity = user
    ? {
        username: user.username,
        email: user.email,
        fullName: user.full_name,
      }
    : undefined;
  const visibleModules = MARKETING_MODULES.filter((module) =>
    canAccessPath(module.href, permissions, roles, routeAccessIdentity, isAuthenticated)
  );
  const featuredModule = visibleModules[0];
  const secondaryModules = visibleModules.slice(1);

  return (
    <ProtectedRoute>
      <Layout>
        <div className={styles.marketingPage}>
          <MarketingPageHero
            eyebrow="Marketing Workspace"
            title="营销协同入口"
            description="先把达人、行业和内容趋势三个入口组织清楚，避免营销能力继续散落在报告和导出之间；这轮只统一结构与视觉层级，不改业务交互。"
            noteLabel="一期范围"
            noteText="已完成导航入口、模块路由与占位页对齐。后续会在这三个模块内逐步接入真实数据能力和协同工作流。"
          />

          <section className={styles.moduleLayout}>
            {featuredModule ? <MarketingModuleCard module={featuredModule} variant="primary" /> : null}

            <div className={styles.moduleStack}>
              {secondaryModules.map((module) => (
                <MarketingModuleCard key={module.key} module={module} variant="secondary" />
              ))}
            </div>
          </section>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
