import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import styles from '../ai-studio.module.css';

export interface AiStudioPlaceholderProps {
  title: string;
  purpose: string;
  /** What is true today, including which stage will deliver the page. */
  currentState: string;
  plannedCapabilities: readonly string[];
  nextAction?: { label: string; to: string; helper: string };
}

/**
 * Honest pre-launch state for studio pages whose data or API has not shipped.
 * It never renders sample data or actions that would imply a working backend.
 */
export function AiStudioPlaceholder({
  title,
  purpose,
  currentState,
  plannedCapabilities,
  nextAction,
}: AiStudioPlaceholderProps) {
  return (
    <section className={styles.panel} aria-labelledby="ai-studio-page-title">
      <header className={styles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">{title}</h1>
          <p>{purpose}</p>
        </div>
        <Badge status="neutral">尚未接入</Badge>
      </header>

      <div className={styles.placeholderGrid}>
        <article className={styles.card}>
          <h2>当前状态</h2>
          <p>{currentState}</p>
          {nextAction ? (
            <div className={styles.nextAction}>
              <RouterLink className={styles.actionLink} to={nextAction.to}>
                {nextAction.label}
              </RouterLink>
              <span>{nextAction.helper}</span>
            </div>
          ) : null}
        </article>
        <article className={styles.card}>
          <h2>上线后提供</h2>
          <ul className={styles.plannedList}>
            {plannedCapabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
