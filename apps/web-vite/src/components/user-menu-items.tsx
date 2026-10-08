import { useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { HomeOutlined, LogoutOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/use-auth';
import styles from './user-menu.module.css';

type UserMenuItems = NonNullable<MenuProps['items']>;

/**
 * Account dropdown items shared by the top-bar menu and the immersive-rail menu.
 * `withHome` adds a way back to the AIOS home for pages without the top bar.
 */
export function useUserMenuItems({ withHome = false }: { withHome?: boolean } = {}) {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  const items: UserMenuItems = user
    ? [
        {
          key: 'user-info',
          label: (
            <div className={styles.userInfo}>
              <div className={styles.username}>{user.username}</div>
              <div className={styles.email}>{user.email}</div>
            </div>
          ),
          disabled: true,
        },
        { type: 'divider' },
        ...(withHome
          ? [{ key: 'home', label: <span><HomeOutlined /> 返回 AIOS 首页</span>, onClick: () => navigate('/') }]
          : []),
        { key: 'profile', label: <span><SafetyOutlined /> 个人信息</span>, onClick: () => navigate('/profile') },
        { type: 'divider' },
        {
          key: 'logout',
          label: (
            <span className={styles.logoutItem}>
              <LogoutOutlined /> 退出登录
            </span>
          ),
          onClick: () => void signOut(),
        },
      ]
    : [];

  return { user, isAuthenticated, isLoading, items, goToLogin: () => navigate('/login') };
}
