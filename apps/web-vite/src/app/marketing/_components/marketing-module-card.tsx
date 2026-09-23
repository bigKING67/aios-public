import { ArrowRightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import styles from '../marketing.module.css';
import type { MarketingModule } from './marketing-workspace-data';

export interface MarketingModuleCardProps {
  module: MarketingModule;
  variant: 'primary' | 'secondary';
}

export function MarketingModuleCard({ module, variant }: MarketingModuleCardProps) {
  const className =
    variant === 'primary'
      ? `${styles.moduleSurface} ${styles.modulePrimary}`
      : `${styles.moduleSurface} ${styles.moduleSecondary}`;

  return (
    <Link
      to={module.href}
      className={className}
      aria-label={`${module.title}，进入模块`}
    >
      <div className={styles.moduleMeta}>
        <span className={styles.moduleLabel}>{module.label}</span>
        <span className={styles.moduleStatus}>一期结构</span>
      </div>

      <div className={styles.moduleBody}>
        <h2 className={styles.moduleTitle}>{module.title}</h2>
        <p className={styles.moduleDescription}>{module.description}</p>
        <ul className={styles.modulePoints}>
          {module.points.map((point) => (
            <li key={point} className={styles.modulePoint}>
              {point}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.moduleFooter}>
        <span className={styles.moduleAction}>
          进入模块
          <ArrowRightOutlined />
        </span>
        <p className={styles.moduleHint}>{module.hint}</p>
      </div>
    </Link>
  );
}
