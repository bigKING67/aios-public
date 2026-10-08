'use client';

import { useState } from 'react';
import { Dropdown } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useUserMenuItems } from './user-menu-items';
import styles from './rail-user-menu.module.css';

/**
 * Account entry at the bottom of the AI 创作中心 console rail: an immersive page
 * without the AIOS top bar (素材库 has its own account chip in its top bar).
 * Same menu as the top bar, plus a way back to the AIOS home.
 */
export function RailUserMenu() {
  const { user, items } = useUserMenuItems({ withHome: true });
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className={styles.slot}>
      <Dropdown menu={{ items }} placement="topLeft" trigger={['click']} open={open} onOpenChange={setOpen}>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`打开 ${user.username} 的用户菜单`}
          aria-haspopup="menu"
          aria-expanded={open}
          title={user.username}
        >
          <span className={styles.avatar} aria-hidden="true">
            <UserOutlined />
          </span>
          <span className={styles.name}>{user.username}</span>
          <span className={styles.hint}>账户</span>
        </button>
      </Dropdown>
    </div>
  );
}
