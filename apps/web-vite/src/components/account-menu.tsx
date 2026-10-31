import { Button, DropdownMenu, type DropdownItem } from '@lobehub/ui';
import { House, LogOut, Monitor, Moon, ShieldCheck, Sun, SunMoon, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { moduleProfileServesHomePage } from '@/lib/module-profile';
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme-preference';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import styles from './account-menu.module.css';

const APPEARANCE_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
];

/** Shared account and appearance entry in the persistent global header. */
export function AccountMenu() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { preference } = useThemePreference();

  if (isLoading || !isAuthenticated) {
    return (
      <Button type="primary" onClick={() => navigate(ROUTE_PATHS.login)}>
        登录
      </Button>
    );
  }
  if (!user) return null;

  const items: DropdownItem[] = [
    ...(moduleProfileServesHomePage()
      ? [{ key: 'home', label: '返回 AIOS 首页', icon: House, onClick: () => navigate(ROUTE_PATHS.home) }]
      : []),
    { key: 'profile', label: '个人信息', icon: ShieldCheck, onClick: () => navigate(ROUTE_PATHS.profile) },
    {
      key: 'appearance',
      label: '外观',
      icon: SunMoon,
      children: APPEARANCE_OPTIONS.map((option) => ({
        type: 'checkbox' as const,
        key: `appearance-${option.value}`,
        label: option.label,
        icon: option.icon,
        checked: preference === option.value,
        onCheckedChange: () => setThemePreference(option.value),
      })),
    },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', icon: LogOut, danger: true, onClick: () => void signOut() },
  ];

  return (
    <DropdownMenu
      items={items}
      header={
        <div className={styles.header}>
          <strong>{user.username}</strong>
          {user.email ? <span>{user.email}</span> : null}
        </div>
      }
    >
      <button type="button" className={styles.trigger} aria-label={`打开 ${user.username} 的用户菜单`}>
        <span className={styles.avatar} aria-hidden="true">
          <UserRound size={14} strokeWidth={1.8} />
        </span>
        <span className={styles.name}>{user.username}</span>
      </button>
    </DropdownMenu>
  );
}
