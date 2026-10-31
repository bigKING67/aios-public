import { Breadcrumb, ConsoleBrand, ConsoleShell, type BreadcrumbProps, type ConsoleBrandProps } from '@lobehub/ui/dashboard';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { AiStudioNav } from './ai-studio-nav';
import { studioLocation } from './ai-studio-nav-config';
import styles from './studio-console.module.css';

type ConsoleBrandLinkProps = Parameters<NonNullable<ConsoleBrandProps['renderLink']>>[0];
type BreadcrumbLinkProps = Parameters<NonNullable<BreadcrumbProps['renderLink']>>[0];

// The global AIOS mark leads to the module directory; this mark stays in the studio.
const BRAND_LINK = { path: ROUTE_PATHS.contentAiStudio, label: 'AI 创作中心首页' };

function renderBrandLink({ href, children, ...rest }: ConsoleBrandLinkProps) {
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}

function renderBreadcrumbLink({ href, children, ...rest }: BreadcrumbLinkProps) {
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}

/**
 * "竞品爆款 / 爆款视频" from the nav config; a subpage or an annotation adds itself after a link
 * back to where it was opened ("原片 / AI 切段 / 标注片段"). The studio home has no trail.
 */
function StudioBreadcrumb() {
  const { pathname, search } = useLocation();
  const { item, crumbs } = studioLocation(pathname, search);
  if (!item || item.path === ROUTE_PATHS.contentAiStudio) return null;
  return <Breadcrumb label="当前位置" renderLink={renderBreadcrumbLink} items={crumbs} />;
}

export function AiStudioShell({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ConsoleShell
        className={styles.shell}
        storageKey="aios.aiStudio.sidebarCollapsed"
        brand={
          <ConsoleBrand
            href={BRAND_LINK.path}
            label={BRAND_LINK.label}
            title="AI 创作中心"
            logo={
              <span className={styles.logo} aria-hidden="true">
                <Sparkles size={16} strokeWidth={1.8} />
              </span>
            }
            renderLink={renderBrandLink}
          />
        }
        navigation={<AiStudioNav />}
        breadcrumb={<StudioBreadcrumb />}
        collapseLabel="收起侧栏"
        expandLabel="展开侧栏"
        openNavigationLabel="打开导航"
        closeNavigationLabel="关闭导航"
        skipToContentLabel="跳到正文"
      >
        <div className={styles.workspace}>{children}</div>
      </ConsoleShell>
    </ProtectedRoute>
  );
}
