import { Link as RouterLink } from 'react-router-dom';
import { buildEditingModePath, type EditingMode } from '../_lib/remix-routes';
import remixStyles from './remix.module.css';

const TABS: ReadonlyArray<{ mode: EditingMode; label: string }> = [
  { mode: 'framework', label: '框架混剪' },
  { mode: 'sellingPoint', label: '卖点混剪' },
  { mode: 'single', label: '单条剪辑' },
];

/** Route-driven switch between framework remix (default), 卖点混剪 and single-task editing. */
export function EditingModeTabs({ mode }: { mode: EditingMode }) {
  return (
    <nav className={remixStyles.modeTabs} aria-label="剪辑方式">
      {TABS.map((tab) => {
        const active = tab.mode === mode;
        return (
          <RouterLink
            key={tab.mode}
            to={buildEditingModePath(tab.mode)}
            className={active ? `${remixStyles.modeTab} ${remixStyles.modeTabActive}` : remixStyles.modeTab}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </RouterLink>
        );
      })}
    </nav>
  );
}
