import { Drawer } from '@lobehub/ui';
import type { CSSProperties } from 'react';

import { LabeledSelect } from '@/components/molecules/labeled-select';

import { formatCompactWanInteger } from './dashboard-formatters';
import dynamicVarStyles from './dashboard-dynamic-vars.module.css';
import canvasStyles from './dashboard-live-funnel-canvas.module.css';
import drawerStyles from './dashboard-live-funnel-drawer.module.css';
import headerStyles from './dashboard-live-funnel-drawer-header.module.css';
import sessionStyles from './dashboard-live-funnel-drawer-session.module.css';
import sessionDropdownStyles from './dashboard-live-funnel-drawer-session-dropdown.module.css';
import sessionSelectStyles from './dashboard-live-funnel-drawer-session-select.module.css';
import type { DashboardLiveDetailRow, LiveFunnelStep } from './dashboard-types';

export type DashboardLiveFunnelSessionOption = {
  label: string;
  value: string;
};

export type DashboardLiveFunnelDrawerProps = {
  open: boolean;
  isMobile: boolean;
  selectedRow: DashboardLiveDetailRow | null;
  dateKey: string | null;
  sessionCount: number;
  sessionOptions: DashboardLiveFunnelSessionOption[];
  selectedSessionKey?: string;
  overallRate: string;
  steps: LiveFunnelStep[];
  onSessionChange: (value: string) => void;
  onClose: () => void;
};

export function DashboardLiveFunnelDrawer({
  open,
  isMobile,
  selectedRow,
  dateKey,
  sessionCount,
  sessionOptions,
  selectedSessionKey,
  overallRate,
  steps,
  onSessionChange,
  onClose,
}: DashboardLiveFunnelDrawerProps) {
  return (
    <Drawer
      title={
        <div className={headerStyles.header}>
          <span className={headerStyles.titleText}>成交转化漏斗</span>
          {selectedRow ? (
            <div className={sessionStyles.sessionArea}>
              <span className={sessionStyles.sessionSwitchLabel}>
                {dateKey ? `${dateKey} · ` : ''}
                {sessionCount} 场直播
              </span>
              {sessionCount > 1 ? (
                <LabeledSelect<string>
                  label="选择直播场次"
                  wrapperClassName={sessionSelectStyles.sessionSelect}
                  classNames={{ trigger: sessionSelectStyles.sessionSelectTrigger }}
                  popupClassName={sessionDropdownStyles.sessionDropdown}
                  size="middle"
                  placeholder="选择直播场次"
                  options={sessionOptions}
                  value={selectedSessionKey}
                  onChange={(value) => {
                    if (value !== undefined) {
                      onSessionChange(value);
                    }
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      }
      classNames={{ content: drawerStyles.body, header: drawerStyles.header, title: drawerStyles.title }}
      placement="right"
      width={isMobile ? '100%' : 1020}
      closable
      open={open}
      onClose={onClose}
    >
      {selectedRow ? (
        <section className={drawerStyles.panel}>
          <div className={canvasStyles.canvas}>
            <div className={canvasStyles.overallBracket}>
              <span className={canvasStyles.overallBracketValue}>{overallRate}</span>
              <em className={canvasStyles.overallBracketLabel}>曝光-成交转化率(人数)</em>
            </div>
            <div className={canvasStyles.stageList}>
              {steps.map((step, index) => {
                const nextStep = steps[index + 1];
                return (
                  <div key={step.key} className={canvasStyles.stage}>
                    <div className={canvasStyles.barWrap}>
                      <div
                        className={`${canvasStyles.bar} ${dynamicVarStyles.liveFunnelBarTone}`}
                        style={{
                          '--live-funnel-bar-width': `${step.widthPercent}%`,
                          '--live-funnel-bar-bg': step.color,
                          '--live-funnel-bar-text': step.textColor,
                          '--live-funnel-bar-delay': `${index * 48}ms`,
                        } as CSSProperties}
                      >
                        <strong className={canvasStyles.barValue}>{formatCompactWanInteger(step.value)}</strong>
                        <span className={canvasStyles.barLabel}>{step.label}</span>
                      </div>
                    </div>
                    {nextStep?.conversionRate && nextStep.conversionLabel ? (
                      <div className={canvasStyles.sideRate}>
                        <span className={canvasStyles.sideRateValue}>{nextStep.conversionRate}</span>
                        <em className={canvasStyles.sideRateLabel}>{nextStep.conversionLabel}</em>
                      </div>
                    ) : (
                      <div className={canvasStyles.sideRatePlaceholder} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </Drawer>
  );
}
