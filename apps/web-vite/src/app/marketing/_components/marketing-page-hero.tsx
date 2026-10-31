import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from '../marketing.module.css';

export interface MarketingPageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  noteLabel: string;
  noteText: string;
  backLink?: {
    to: string;
    label: string;
  };
}

export function MarketingPageHero({
  backLink,
  description,
  eyebrow,
  noteLabel,
  noteText,
  title,
}: MarketingPageHeroProps) {
  return (
    <section className={styles.pageHero}>
      <div className={styles.pageHead}>
        {backLink ? (
          <Link to={backLink.to} className={styles.backLink}>
            <ArrowLeft size={14} strokeWidth={1.8} />
            {backLink.label}
          </Link>
        ) : null}
        <p className={styles.pageEyebrow}>{eyebrow}</p>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>

      <aside className={styles.heroNote}>
        <p className={styles.heroNoteLabel}>{noteLabel}</p>
        <p className={styles.heroNoteText}>{noteText}</p>
      </aside>
    </section>
  );
}
