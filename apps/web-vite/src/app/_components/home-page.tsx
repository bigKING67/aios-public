import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildLayoutMenuItems, buildLoginRedirectHref } from '@/components/organisms/layout-navigation-model';
import { moduleDataStatus, type ModuleDataStatus } from '@/lib/module-profile';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';
import { buildHomeDirectory, UPCOMING_DOMAINS } from './home-directory';
import styles from './home-page.module.css';

const STATUS_LABELS: Record<ModuleDataStatus, string | null> = { open: null, not_connected: '未接入数据', not_open: '未开放' };

/** The company's module directory: every domain the account can open, with honest data status. */
function ModuleDirectory() {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const roles = useAuthStore(selectUserRoles);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionChecked = useAuthStore((state) => state.hasSessionChecked);
  const domains = useMemo(
    () => buildHomeDirectory(
      buildLayoutMenuItems({ pathname: ROUTE_PATHS.home, permissions, roles, user, isAuthenticated }),
      (path) => moduleDataStatus(path),
    ),
    [isAuthenticated, permissions, roles, user],
  );

  // Hold the directory until the session settles, so a signed-in user never sees the anonymous line.
  if (!sessionChecked) return <div className={styles.directory} aria-busy="true" />;
  if (!isAuthenticated) {
    return (
      <div className={styles.directory}>
        <p className={styles.signIn}>
          登录后查看你可以使用的模块。
          <Link className={styles.textLink} to={buildLoginRedirectHref(ROUTE_PATHS.home)}>登录<ArrowRight size={16} aria-hidden /></Link>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.directory}>
      {domains.map((domain) => (
        <section key={domain.key} className={styles.domain} aria-labelledby={`domain-${domain.key}`}>
          <h2 id={`domain-${domain.key}`}>{domain.label}</h2>
          <ul>
            {domain.modules.map(({ key, href, label, summary, icon: Icon, status }) => (
              <li key={key}>
                <Link className={styles.module} to={href} data-open={status === 'open' || undefined}>
                  <span className={styles.moduleIcon} aria-hidden>{Icon ? <Icon size={16} /> : null}</span>
                  <span className={styles.moduleName}>{label}</span>
                  <span className={styles.moduleSummary}>{summary}</span>
                  {STATUS_LABELS[status] ? <span className={styles.moduleStatus}>{STATUS_LABELS[status]}</span> : null}
                  <ArrowRight className={styles.moduleArrow} size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className={styles.domain} aria-labelledby="domain-upcoming">
        <h2 id="domain-upcoming">即将接入</h2>
        <p className={styles.upcoming}>{UPCOMING_DOMAINS.join(' · ')}</p>
      </section>
    </div>
  );
}

/** AIOS product home: what the company runs here, then the modules this account can open. */
export function HomePage() {
  return (
    <main className={styles.page} id="home-content">
      <a className={styles.skip} href="#home-content">跳到正文</a>
      <section className={styles.hero} aria-labelledby="home-title">
        <p className={styles.eyebrow}>AGI AIOS</p>
        {/* Phrase spans keep a narrow screen from breaking inside a word (「里运 / 转」). */}
        <h1 id="home-title">
          公司的每一项业务，<br />
          <span className={styles.phrase}>在同一个 AIOS</span>{' '}<span className={styles.phrase}>里运转。</span>
        </h1>
        <div className={styles.heroBottom}>
          <p className={styles.lead}>内容、经营、营销，以及之后的产品、人力与财务。<br />AI 参与执行，团队专注判断。</p>
          <Link className={styles.textLink} to={ROUTE_PATHS.docs}>浏览文档<ArrowRight size={16} aria-hidden /></Link>
        </div>
      </section>
      <ModuleDirectory />
      <footer className={styles.footer}><span>AIOS</span><span>AI 驱动的业务生产力系统</span><span>© 2026</span></footer>
    </main>
  );
}
