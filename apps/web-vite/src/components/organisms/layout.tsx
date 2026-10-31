import { ConsoleBrand, ConsoleNav, ConsoleShell, type ConsoleBrandProps, type ConsoleNavProps } from '@lobehub/ui/dashboard';
import { Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';
import {
  buildLayoutMenuItems,
  collectRouteKeys,
  resolveLayoutMenuPath,
  resolveModuleNavigation,
  type LayoutNavLink,
} from './layout-navigation-model';
import { isDocsRoutePath, isEdgeToEdgeContentRoutePath, resolveSelectedMenuKey } from './layout-route-selection';
import styles from './layout.module.css';

export interface LayoutProps {
  children: ReactNode;
  variant?: 'default' | 'immersive';
}

type NavLinkArgs = Parameters<NonNullable<ConsoleNavProps['renderLink']>>[0];
type BrandLinkArgs = Parameters<NonNullable<ConsoleBrandProps['renderLink']>>[0];

function renderNavLink({ href, children, external, ...rest }: NavLinkArgs) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}

function renderBrandLink({ href, children, ...rest }: BrandLinkArgs) {
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}

function toConsoleItem(link: LayoutNavLink) {
  return { href: link.href, label: link.label, icon: link.icon };
}

export function Layout({ children, variant = 'default' }: LayoutProps) {
  const { pathname } = useLocation();
  if (variant === 'immersive' || isDocsRoutePath(pathname)) {
    // Docs and immersive workbenches bring their own local navigation.
    return <div className={styles.immersive}>{children}</div>;
  }
  return <ConsoleLayout pathname={pathname}>{children}</ConsoleLayout>;
}

function ConsoleLayout({ children, pathname }: { children: ReactNode; pathname: string }) {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore(selectUserRoles);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const menuItems = useMemo(
    () => buildLayoutMenuItems({ isAuthenticated, pathname, permissions, roles, user }),
    [isAuthenticated, pathname, permissions, roles, user],
  );
  const module = resolveModuleNavigation(menuItems, pathname);
  const activePath = resolveSelectedMenuKey(resolveLayoutMenuPath(pathname), collectRouteKeys(menuItems));
  const edgeToEdge = isEdgeToEdgeContentRoutePath(pathname);
  const content = (
    <div className={edgeToEdge ? styles.edge : styles.workspace}>
      {children}
      <p className={styles.footer}>AGI AIOS ©2026 · AI 驱动的业务生产力系统</p>
    </div>
  );

  if (!module) return <main className={styles.immersive}>{content}</main>;

  return (
    <ConsoleShell
      className={styles.shell}
      storageKey={`aios.console.${module.key}.sidebarCollapsed`}
      brand={
        <ConsoleBrand
          href={module.links[0].href}
          label={`${module.label}首页`}
          title={module.label}
          logo={
            <span className={styles.logo} aria-hidden="true">
              <Sparkles size={16} strokeWidth={1.8} />
            </span>
          }
          renderLink={renderBrandLink}
        />
      }
      navigation={<ConsoleNav label={`${module.label}导航`} pathname={activePath} items={module.links.map(toConsoleItem)} renderLink={renderNavLink} />}
      collapseLabel="收起侧栏"
      expandLabel="展开侧栏"
      openNavigationLabel="打开导航"
      closeNavigationLabel="关闭导航"
      skipToContentLabel="跳到正文"
    >
      {content}
    </ConsoleShell>
  );
}

export default Layout;
