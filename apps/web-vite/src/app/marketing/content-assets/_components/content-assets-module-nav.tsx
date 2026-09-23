import {
  FileImageOutlined,
} from '@ant-design/icons';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { formatBytes } from '../_lib/content-assets-formatters';
import type { ContentAssetSummary } from '../_lib/content-assets-types';
import {
  CONTENT_ASSETS_MODULE_GROUPS,
  type ContentAssetsModuleKey,
} from './content-assets-module-nav-config';
import styles from './content-assets-console.module.css';

export function ContentAssetsModuleNav({
  activeModule,
  onModuleChange,
  summary,
}: {
  activeModule: ContentAssetsModuleKey;
  onModuleChange: (module: ContentAssetsModuleKey) => void;
  summary: ContentAssetSummary;
}) {
  return (
    <aside className={styles.moduleRail} aria-label="素材库导航">
      <div className={styles.brandLockup}>
        <RouterLink
          className={styles.brandMark}
          to={ROUTE_PATHS.home}
          aria-label="返回首页"
          title="返回首页"
        >
          <FileImageOutlined />
        </RouterLink>
        <div className={styles.brandText}>
          <strong>素材库</strong>
          <span>素材资产 / 分析 / 回流</span>
        </div>
      </div>

      <nav className={styles.moduleNav}>
        {CONTENT_ASSETS_MODULE_GROUPS.map((group) => (
          <section className={styles.moduleNavGroup} key={group.title}>
            <p>{group.title}</p>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`${styles.moduleNavItem} ${activeModule === item.key ? styles.moduleNavItemActive : ''}`}
                type="button"
                aria-label={item.label}
                aria-pressed={activeModule === item.key}
                title={item.label}
                onClick={() => onModuleChange(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>

      <div className={styles.storageCard}>
        <span className={styles.storageEyebrow}>存储状态</span>
        <strong>video.groland-inc.com</strong>
        <p>当前使用 TOS 短时签名链接</p>
        <span>
          原片 {formatBytes(summary.totalRawSizeBytes)} · 已就绪 {summary.readyAssets} · 待生成 {summary.pendingAssets}
        </span>
      </div>
    </aside>
  );
}
