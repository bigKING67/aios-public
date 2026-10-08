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
import { Dropdown, Button } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useUserMenuItems } from './user-menu-items';
import styles from './user-menu.module.css';

export function UserMenu() {
  const { user, isAuthenticated, isLoading, items, goToLogin } = useUserMenuItems();
  const [open, setOpen] = useState(false);

  if (isLoading || !isAuthenticated) {
    return (
      <Button type="primary" className={styles.headerLoginButton} onClick={goToLogin}>
        登 录
      </Button>
    );
  }

  if (!user) {
    return null;
  }

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
