import { RobotOutlined } from '@ant-design/icons';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import consoleStyles from '@/app/marketing/content-assets/_components/content-assets-console.module.css';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { RailUserMenu } from '@/components/rail-user-menu';
import { UserMenu } from '@/components/user-menu';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { AiStudioCompactNav, AiStudioRailNav } from './ai-studio-nav';
import styles from '../ai-studio.module.css';

// Matches the breakpoint where the shared console rail collapses.
const COMPACT_NAV_QUERY = '(max-width: 980px)';

export function AiStudioShell({ children }: { children: ReactNode }) {
  const isCompact = useMediaQuery(COMPACT_NAV_QUERY);

  return (
    <ProtectedRoute>
      <Layout variant="immersive">
        <main className={styles.pageShell}>
          <div className={consoleStyles.consoleShell}>
            <aside className={consoleStyles.moduleRail} aria-label="AI 创作中心">
              <div className={`${consoleStyles.brandLockup} ${styles.railBrand}`}>
                <RouterLink className={consoleStyles.brandMark} to={ROUTE_PATHS.home} aria-label="返回首页" title="返回首页">
                  <RobotOutlined aria-hidden />
                  <span className="sr-only">返回首页</span>
                </RouterLink>
                <div className={consoleStyles.brandText}>
                  <strong>AI 创作中心</strong>
                  <span>片段 / 混剪 / 成片</span>
                </div>
              </div>
              {!isCompact && <AiStudioRailNav />}
              {!isCompact && <RailUserMenu />}
            </aside>
            <section className={consoleStyles.consoleMain}>
              {isCompact && (
                <div className={styles.compactBar}>
                  <AiStudioCompactNav />
                  <UserMenu />
                </div>
              )}
              {/* Two-character buttons (刷新、清空) keep normal spacing like their four-character neighbours. */}
              <ConfigProvider button={{ autoInsertSpace: false }}>
                <div className={consoleStyles.workspaceScroll}>{children}</div>
              </ConfigProvider>
            </section>
          </div>
        </main>
      </Layout>
    </ProtectedRoute>
  );
}
