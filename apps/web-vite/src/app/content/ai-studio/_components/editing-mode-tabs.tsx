import { Link as RouterLink } from 'react-router-dom';
import { buildEditingModePath } from '../_lib/remix-routes';
import remixStyles from './remix.module.css';

/** Route-driven switch between framework remix batches (default) and single-task editing. */
export function EditingModeTabs({ remix }: { remix: boolean }) {
  const tabs = [
    { remix: true, label: '框架混剪' },
    { remix: false, label: '单条剪辑' },
  ];
  return (
    <nav className={remixStyles.modeTabs} aria-label="剪辑方式">
      {tabs.map((tab) => {
        const active = tab.remix === remix;
        return (
          <RouterLink
            key={tab.label}
            to={buildEditingModePath(tab.remix)}
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
