/**
 * 用户菜单组件
 *
 * 显示在顶部导航栏，包含：
 * - 用户头像和用户名
 * - 个人信息入口
 * - 登出选项
 */

'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Button } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks/use-auth';
import styles from './user-menu.module.css';

export function UserMenu() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (isLoading || !isAuthenticated) {
    return (
      <Button type="primary" className={styles.headerLoginButton} onClick={() => navigate('/login')}>
        登 录
      </Button>
    );
  }

  if (!user) {
    return null;
  }

  /**
   * 处理登出
   */
  const handleLogout = async () => {
    await signOut();
  };

  /**
   * 菜单项
   */
  const items = [
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
    {
      type: 'divider' as const,
    },
    {
      key: 'profile',
      label: (
        <span>
          <SafetyOutlined /> 个人信息
        </span>
      ),
      onClick: () => navigate('/profile'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      label: (
        <span className={styles.logoutItem}>
          <LogoutOutlined /> 退出登录
        </span>
      ),
      onClick: handleLogout,
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      placement="bottomRight"
      trigger={['hover', 'click']}
      open={open}
      onOpenChange={setOpen}
    >
      <button
        type="button"
        className={styles.headerUserTrigger}
        aria-label={`打开 ${user.username} 的用户菜单`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.userAvatar} aria-hidden="true">
          <UserOutlined />
        </span>
        <span className={styles.usernameText}>{user.username}</span>
      </button>
    </Dropdown>
  );
}

export default UserMenu;
