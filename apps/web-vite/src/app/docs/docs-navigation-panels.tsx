'use client';

import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { DocsPageKey, DocsPageLink, NavItem } from './docs-workspace-contracts';
import { extractHashId } from './docs-workspace-model';
import styles from './docs-navigation-panels.module.css';

interface DocsSidebarProps {
  activeId: string;
  isScrolling: boolean;
  onActiveIdChange: (id: string) => void;
  pageKey: DocsPageKey;
  pageLinks: DocsPageLink[];
  sidebarRef: RefObject<HTMLElement | null>;
  sectionNav: NavItem[];
}

interface DocsTocProps {
  activeId: string;
  isScrolling: boolean;
  onActiveIdChange: (id: string) => void;
  sectionNav: NavItem[];
  tocRef: RefObject<HTMLElement | null>;
}

export function DocsSidebar({
  activeId,
  isScrolling,
  onActiveIdChange,
  pageKey,
  pageLinks,
  sidebarRef,
  sectionNav,
}: DocsSidebarProps) {
  return (
    <aside className={styles.sidebarPanel}>
      <Link to="/docs" className={styles.sidebarBrand}>
        <span className={styles.brandMark} />
        <span className={styles.brandText}>AIOS Docs</span>
      </Link>

      <nav
        ref={sidebarRef}
        className={`${styles.sidebarScroll} ${isScrolling ? styles.isScrolling : ''}`}
        aria-label="左侧目录"
      >
        <div className={styles.navGroup}>
          <p className={styles.navGroupTitle}>文档分区</p>
          <div className={styles.navList}>
            {pageLinks.map((item) => {
              const isActive = pageKey === item.key;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`${styles.navLink} ${styles.routeNavLink} ${isActive ? styles.navLinkActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span>{item.label}</span>
                  <small>{item.helper}</small>
                </Link>
              );
            })}
          </div>
        </div>

        <div className={styles.navGroup}>
          <p className={styles.navGroupTitle}>本页内容</p>
          <div className={styles.navList}>
            {sectionNav.map((item) => {
              const sectionId = extractHashId(item.href);
              const isActive = activeId === sectionId;

              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                  onClick={() => onActiveIdChange(sectionId)}
                  aria-current={isActive ? 'location' : undefined}
                >
                    {item.label}
                </a>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
}

export function DocsToc({
  activeId,
  isScrolling,
  onActiveIdChange,
  sectionNav,
  tocRef,
}: DocsTocProps) {
  return (
    <aside className={styles.tocPanel}>
      <div className={styles.tocSticky}>
        <p className={styles.tocTitle}>在此页面</p>
        <nav
          ref={tocRef}
          className={`${styles.tocScroll} ${isScrolling ? styles.isScrolling : ''}`}
          aria-label="右侧目录"
        >
          {sectionNav.map((item) => {
            const sectionId = extractHashId(item.href);
            const isActive = activeId === sectionId;

            return (
              <a
                key={item.href}
                href={item.href}
                className={`${styles.tocLink} ${isActive ? styles.tocLinkActive : ''}`}
                onClick={() => onActiveIdChange(sectionId)}
                aria-current={isActive ? 'location' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
