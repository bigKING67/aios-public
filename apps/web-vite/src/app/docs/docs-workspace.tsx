'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createAnimationFrameCoalescer, resolveActiveSectionId } from './docs-active-section';
import { DocsSidebar, DocsToc } from './docs-navigation-panels';
import { useScrollActivity } from './docs-scroll-activity';
import type {
  DocsCard,
  DocsPageModel,
  DocsSection,
  DocsStep,
  DocsTable,
  DocsWorkspaceSnapshot,
} from './docs-workspace-contracts';
import {
  extractHashId,
  resolveDocsPage,
  resolveDocsPageKey,
  sectionIdsForSections,
  tocForSections,
} from './docs-workspace-model';
import { useDocsWorkspaceSnapshot } from './use-docs-workspace-snapshot';
import styles from './docs.module.css';

export function DocsWorkspace() {
  const { retry, state } = useDocsWorkspaceSnapshot();

  if (state.status === 'loading') {
    return <DocsWorkspaceState title="正在加载文档内容" />;
  }
  if (state.status === 'error') {
    return (
      <DocsWorkspaceState
        title="文档内容加载失败"
        message={state.message}
        actionLabel="重新加载"
        onAction={retry}
      />
    );
  }

  return <DocsWorkspaceContent snapshot={state.snapshot} />;
}

function DocsWorkspaceState({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  message?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className={styles.workspaceState} role="status">
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className={styles.workspaceStateAction} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function DocsWorkspaceContent({ snapshot }: { snapshot: DocsWorkspaceSnapshot }) {
  const location = useLocation();
  const pageKey = resolveDocsPageKey(snapshot, location.pathname);
  const page = resolveDocsPage(snapshot, location.pathname);
  const sectionIds = useMemo(() => sectionIdsForSections(page.sections), [page]);
  const tocNav = useMemo(() => tocForSections(page.sections), [page]);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const tocRef = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string>(sectionIds[0] ?? '');
  const sidebarIsScrolling = useScrollActivity(sidebarRef);
  const contentIsScrolling = useScrollActivity(contentRef);
  const tocIsScrolling = useScrollActivity(tocRef);

  useEffect(() => {
    if (!location.hash) {
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [location.hash, page.path]);

  useEffect(() => {
    const syncFromHash = () => {
      const hashId = extractHashId(window.location.hash);
      if (hashId && sectionIds.includes(hashId)) {
        setActiveId(hashId);
        return;
      }

      setActiveId(sectionIds[0] ?? '');
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [sectionIds]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const updateActiveFromLayout = () => {
      const containerTop = contentElement.getBoundingClientRect().top;
      const nextActiveId = resolveActiveSectionId(sectionIds, 136, (id) => {
        const section = document.getElementById(id);
        return section ? section.getBoundingClientRect().top - containerTop : null;
      });
      if (nextActiveId) {
        setActiveId((currentId) => (currentId === nextActiveId ? currentId : nextActiveId));
      }
    };

    const coalescer = createAnimationFrameCoalescer(updateActiveFromLayout, {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
    });
    const passiveListenerOptions = { passive: true } as const;
    coalescer.schedule();
    contentElement.addEventListener('scroll', coalescer.schedule, passiveListenerOptions);
    window.addEventListener('resize', coalescer.schedule, passiveListenerOptions);

    return () => {
      contentElement.removeEventListener('scroll', coalescer.schedule);
      window.removeEventListener('resize', coalescer.schedule);
      coalescer.cancel();
    };
  }, [sectionIds]);

  return (
    <div className={styles.pageWrap}>
      <DocsSidebar
        activeId={activeId}
        isScrolling={sidebarIsScrolling}
        onActiveIdChange={setActiveId}
        pageKey={pageKey}
        pageLinks={snapshot.pageLinks}
        sidebarRef={sidebarRef}
        sectionNav={tocNav}
      />

      <main className={styles.mainPanel}>
        <article
          ref={contentRef}
          className={`${styles.contentScroll} ${contentIsScrolling ? styles.isScrolling : ''}`}
        >
          <div className={styles.contentInner}>
            <DocsHero page={page} />

            {page.sections.map((section) => (
              <DocsSectionBlock key={section.id} section={section} />
            ))}
          </div>
        </article>
      </main>

      <DocsToc
        activeId={activeId}
        isScrolling={tocIsScrolling}
        onActiveIdChange={setActiveId}
        sectionNav={tocNav}
        tocRef={tocRef}
      />
    </div>
  );
}

function DocsHero({ page }: { page: DocsPageModel }) {
  return (
    <header className={styles.heroHeader}>
      <p className={styles.heroEyebrow}>{page.eyebrow}</p>
      <div className={styles.heroRow}>
        <div>
          <h1 className={styles.heroTitle}>{page.title}</h1>
          <p className={styles.heroSubtitle}>{page.subtitle}</p>
        </div>
        {page.primaryAction ? (
          <Link to={page.primaryAction.href} className={styles.heroAction}>
            {page.primaryAction.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function DocsSectionBlock({ section }: { section: DocsSection }) {
  return (
    <section className={styles.docSection} id={section.id}>
      <h2>{section.title}</h2>
      {section.lead ? <p className={styles.sectionLead}>{section.lead}</p> : null}
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.rows ? <DocsRows rows={section.rows} /> : null}
      {section.cards ? <DocsCards cards={section.cards} /> : null}
      {section.steps ? <DocsSteps steps={section.steps} /> : null}
      {section.tables ? <DocsTables tables={section.tables} /> : null}
    </section>
  );
}

function DocsRows({ rows }: { rows: NonNullable<DocsSection['rows']> }) {
  return (
    <div className={styles.valueTableWrap}>
      <table className={styles.valueTable}>
        <thead>
          <tr>
            <th>主题</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsCards({ cards }: { cards: DocsCard[] }) {
  return (
    <div className={styles.cardGrid}>
      {cards.map((card) => (
        <article key={card.title} className={styles.infoCard}>
          {card.meta ? <p className={styles.cardMeta}>{card.meta}</p> : null}
          <h3>{card.title}</h3>
          <p>{card.desc}</p>
          {card.details ? (
            <dl className={styles.cardDetails}>
              {card.details.map((detail) => (
                <div key={detail.label} className={styles.cardDetailRow}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {card.tags ? (
            <div className={styles.cardTags} aria-label={`${card.title} 标签`}>
              {card.tags.map((tag) => (
                <span key={tag} className={styles.cardTag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {card.href && card.action ? (
            <DocsActionLink href={card.href} className={styles.quickCardAction}>
              {card.action}
            </DocsActionLink>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DocsSteps({ steps }: { steps: DocsStep[] }) {
  return (
    <div className={styles.stepList}>
      {steps.map((step) => (
        <div key={step.title} className={styles.stepItem}>
          <strong>{step.title}</strong>
          <p>{step.desc}</p>
        </div>
      ))}
    </div>
  );
}

function DocsTables({ tables }: { tables: DocsTable[] }) {
  return (
    <div className={styles.tableStack}>
      {tables.map((table) => (
        <div key={table.title ?? table.headers.join('-')} className={styles.dataTableBlock}>
          {table.title ? <h3 className={styles.tableTitle}>{table.title}</h3> : null}
          <div className={styles.valueTableWrap}>
            <table className={`${styles.valueTable} ${styles.docDataTable}`}>
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${table.title ?? 'table'}-${rowIndex}`}>
                    {table.headers.map((header, cellIndex) => (
                      <td key={`${header}-${cellIndex}`} data-label={header}>
                        {row[cellIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function DocsActionLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  if (href.startsWith('#')) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
