import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import consoleStyles from '@/app/marketing/content-assets/_components/content-assets-console.module.css';
import { AI_STUDIO_NAV_GROUPS } from './ai-studio-nav-config';
import styles from '../ai-studio.module.css';

/** Route-driven rail navigation; reuses the content-asset console rail styles. */
export function AiStudioRailNav() {
  return (
    <nav className={consoleStyles.moduleNav} aria-label="AI 创作中心导航">
      {AI_STUDIO_NAV_GROUPS.map((group) => (
        <section className={consoleStyles.moduleNavGroup} key={group.title}>
          <p>{group.title}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) =>
                `${consoleStyles.moduleNavItem} ${styles.railNavLink} ${isActive ? consoleStyles.moduleNavItemActive : ''}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}

/**
 * Horizontal navigation for narrow viewports where the console rail is hidden.
 * The strip scrolls sideways, so the active page is centred on every route change.
 */
export function AiStudioCompactNav() {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    // Horizontal only: scrollIntoView would also move the page vertically.
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);
  return (
    <nav ref={navRef} className={styles.compactNav} aria-label="AI 创作中心导航">
      {AI_STUDIO_NAV_GROUPS.flatMap((group) => group.items).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          aria-label={item.label}
          className={({ isActive }) => `${styles.compactNavItem} ${isActive ? styles.compactNavItemActive : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
