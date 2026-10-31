import { DropdownMenu, type DropdownItem } from '@lobehub/ui';
import { ChevronDown, PanelsTopLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu } from '@/components/account-menu';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';
import { buildLayoutMenuItems, type LayoutNavEntry, type LayoutNavLink } from './layout-navigation-model';
import styles from './aios-global-navigation.module.css';

const PRIMARY_GROUPS = new Set(['dashboard', 'reports', 'content', ROUTE_PATHS.marketing, 'marketing', ROUTE_PATHS.docs]);
const MENU_POPUP = { className: styles.menu };

/** Product-level navigation stays above each module's own workspace sidebar. */
export function AiosGlobalNavigation() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore(selectUserRoles);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const items = useMemo(() => buildLayoutMenuItems({ pathname, permissions, roles, user, isAuthenticated })
    .filter((item) => item.key !== ROUTE_PATHS.home), [pathname, permissions, roles, user, isAuthenticated]);
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = (item: LayoutNavEntry) => item.kind === 'link' ? matches(item.key) : item.links.some((link) => matches(link.key));
  const destination = (link: LayoutNavLink): DropdownItem => ({
    key: link.key, label: link.label, icon: link.icon,
    // This is navigation within the same AIOS shell; the hub's new-tab actions remain unchanged.
    onClick: () => navigate(link.href),
  });
  const menuItem = (item: LayoutNavEntry): DropdownItem => item.kind === 'link'
    ? destination(item)
    : { key: item.key, label: item.label, icon: item.icon, children: item.links.map(destination) };
  const secondary = items.filter((item) => !PRIMARY_GROUPS.has(item.key));

  return (
    <header className={styles.header}>
      <Link to={ROUTE_PATHS.home} className={styles.brand} aria-label="AIOS 首页">
        <img className={`${styles.wordmark} ${styles.lightWordmark}`} src="/brand/aios-wordmark-black.svg" width={868} height={330} alt="" />
        <img className={`${styles.wordmark} ${styles.darkWordmark}`} src="/brand/aios-wordmark-white.svg" width={868} height={330} alt="" />
      </Link>
      <nav className={styles.desktop} aria-label="AIOS 全局导航">
        {/* Each group opens on hover or click; only 更多 keeps a chevron, the rest read as plain labels. */}
        {items.filter((item) => PRIMARY_GROUPS.has(item.key)).map((item) => (
          <DropdownMenu
            key={item.key}
            items={item.kind === 'group' ? item.links.map(destination) : [destination(item)]}
            placement="bottom"
            trigger="both"
            popupProps={MENU_POPUP}
          >
            <button type="button" className={styles.tab} data-active={active(item) || undefined}>
              {item.label}
            </button>
          </DropdownMenu>
        ))}
        {secondary.length > 0 ? (
          <DropdownMenu items={secondary.map(menuItem)} placement="bottom" trigger="both" popupProps={MENU_POPUP}>
            <button type="button" className={styles.tab} data-active={secondary.some(active) || undefined}>更多<ChevronDown size={14} aria-hidden /></button>
          </DropdownMenu>
        ) : null}
      </nav>
      <nav className={styles.mobile} aria-label="AIOS 模块导航">
        <DropdownMenu items={items.map(menuItem)} placement="bottomRight" popupProps={MENU_POPUP}>
          <button type="button" className={styles.tab}><PanelsTopLeft size={16} aria-hidden />切换模块<ChevronDown size={12} aria-hidden /></button>
        </DropdownMenu>
      </nav>
      <div className={styles.account}><AccountMenu /></div>
    </header>
  );
}
