'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu } from 'antd';
import UserMenu from '@/components/user-menu';
import { useAuthStore } from '@/stores/auth.store';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  buildLayoutMenuItems,
  collectRouteKeys,
  type LayoutMenuItems,
} from './layout-navigation-model';
import {
  isDocsRoutePath,
  resolveContentClassName,
  resolveSelectedMenuKey,
} from './layout-route-selection';
import { centerSelectedMobileMenuItem } from './layout-mobile-navigation';
import styles from './layout.module.css';

const { Header, Content, Footer } = AntLayout;

export interface LayoutProps {
  children: React.ReactNode;
  variant?: 'default' | 'immersive';
}

export const Layout: React.FC<LayoutProps> = ({ children, variant = 'default' }) => {
  const pathname = useLocation().pathname;
  if (variant === 'immersive') {
    return (
      <AntLayout className={styles.shell}>
        <Content className={`${styles.content} ${styles.contentImmersive}`}>
          {children}
        </Content>
      </AntLayout>
    );
  }

  return <DefaultLayoutChrome pathname={pathname}>{children}</DefaultLayoutChrome>;
};

function DefaultLayoutChrome({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.user?.roles || []);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const menuItems = useMemo<LayoutMenuItems>(
    () => buildLayoutMenuItems({
      isAuthenticated,
      pathname,
      permissions,
      roles,
      user,
    }),
    [isAuthenticated, pathname, permissions, roles, user]
  );

  const routeKeys = useMemo(() => collectRouteKeys(menuItems), [menuItems]);
  const selectedMenuKey = resolveSelectedMenuKey(pathname, routeKeys);
  const mobileNavScrollRef = useRef<HTMLDivElement>(null);
  const isDocsRoute = isDocsRoutePath(pathname);
  const contentClassName = resolveContentClassName(pathname);

  useEffect(() => {
    const scrollContainer = mobileNavScrollRef.current;
    if (scrollContainer) centerSelectedMobileMenuItem(scrollContainer);
  }, [selectedMenuKey]);

  return (
    <AntLayout className={styles.shell}>
      <Header
        className={`${styles.header} px-0`}
      >
        <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4">
          <div className="relative flex min-h-[72px] items-center gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center md:min-w-[196px] md:flex-none md:shrink-0">
              <Link to={ROUTE_PATHS.home} aria-label="返回首页" className="inline-flex items-center">
                <img
                  src="/home-brand-crop.png"
                  alt="Groland 数据中枢"
                  width={180}
                  height={48}
                  className="h-8 sm:h-10 w-auto object-contain"
                />
              </Link>
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-center px-6 md:flex">
              <Menu
                mode="horizontal"
                selectedKeys={[selectedMenuKey]}
                items={menuItems}
                className="header-nav-menu border-none bg-transparent"
              />
            </div>

            <div className="ml-auto flex min-w-0 items-center justify-end md:min-w-[196px] md:shrink-0">
              <UserMenu />
            </div>
          </div>

          <div className="pb-2 md:hidden">
            <div ref={mobileNavScrollRef} className="mobile-nav-scroll w-full overflow-x-auto">
              <Menu
                mode="horizontal"
                selectedKeys={[selectedMenuKey]}
                items={menuItems}
                className="header-nav-menu header-nav-menu-mobile border-none bg-transparent"
              />
            </div>
          </div>
        </div>
      </Header>

      <Content
        className={`${styles.content} ${contentClassName}`}
      >
        {children}
      </Content>

      {!isDocsRoute && (
        <Footer
          className={styles.footer}
        >
          Groland AIOS ©2026 · AI 驱动的业务生产力系统
        </Footer>
      )}
    </AntLayout>
  );
}

export default Layout;
