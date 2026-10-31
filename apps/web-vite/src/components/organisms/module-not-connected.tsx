import { Link, useLocation } from 'react-router-dom';
import { Layout } from './layout';
import { ProtectedRoute } from '@/components/protected-route';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import styles from './module-not-connected.module.css';

/** BQL has no legacy warehouse. Do not mount its clients or show missing data as zero. */
export function ModuleNotConnected() {
  const { pathname } = useLocation();
  const title = pathname.startsWith('/dashboard') ? '看板'
    : pathname.startsWith('/reports') ? '报告'
      : pathname.startsWith('/ops') ? '数据运维'
        : pathname.startsWith('/marketing') ? '营销'
          : pathname.startsWith('/sample-inventory') ? '样品库存'
            : pathname.startsWith('/content/live-center') ? '直播中台'
              : pathname.startsWith('/admin') ? '管理'
                : '导出';
  return (
    <ProtectedRoute>
      <Layout>
        <section className={styles.page} aria-labelledby="module-title">
          <h1 id="module-title">{title}</h1>
          <div className={styles.empty}>
            <h2>尚未接入百雀羚数据</h2>
            <p>当前工作区的这项业务尚未启用。接入百雀羚对应数据后，可在这里使用。</p>
            <p>AI 创作中心和文档可正常访问。</p>
            <div className={styles.links}>
              <Link to={ROUTE_PATHS.contentAiStudio}>前往 AI 创作中心</Link>
              <Link to={ROUTE_PATHS.docs}>查看文档</Link>
            </div>
          </div>
        </section>
      </Layout>
    </ProtectedRoute>
  );
}
