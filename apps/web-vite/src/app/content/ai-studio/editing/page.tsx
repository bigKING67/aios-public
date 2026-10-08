'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link as RouterLink, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { ContentEditingWorkspace } from '@/app/marketing/content-assets/_components/content-editing-workspace';
import { AiStudioCapabilityGate } from '../_components/ai-studio-capability-gate';
import { AiStudioShell } from '../_components/ai-studio-shell';
import { FrameworkRemixPanel } from '../_components/framework-remix-panel';
import { SingleEditPanel } from '../_components/single-edit-workbench';
import { SINGLE_EDIT_PURPOSE } from '../_lib/remix-edit';
import { REMIX_PURPOSE, RUN_DETAIL_PURPOSE } from '../_lib/remix-form';
import { EDITING_MODE_PARAM, EDITING_RUN_PARAM, EDITING_SINGLE_MODE } from '../_lib/remix-routes';
import styles from '../ai-studio.module.css';
import annotationStyles from '../_components/segment-annotation.module.css';

export default function AiStudioEditingPage() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const mode = params.get(EDITING_MODE_PARAM);
  if (!mode && params.get(EDITING_RUN_PARAM)) {
    // A single-task deep link: pin the mode so leaving the run stays on single editing.
    const next = new URLSearchParams(params);
    next.set(EDITING_MODE_PARAM, EDITING_SINGLE_MODE);
    return <Navigate replace to={`?${next.toString()}${hash}`} />;
  }
  // A task link (`editingRun`) always opens the task detail, whatever mode the URL also carries.
  const legacyRun = params.get(EDITING_RUN_PARAM) !== null;
  const remix = !legacyRun && mode !== EDITING_SINGLE_MODE;
  return (
    <AiStudioShell>
      <div className={styles.panel}>
        {remix ? (
          <AiStudioCapabilityGate title="AI 剪辑" purpose={REMIX_PURPOSE}>
            {(capabilities) => <FrameworkRemixPanel capabilities={capabilities} />}
          </AiStudioCapabilityGate>
        ) : !legacyRun ? (
          <AiStudioCapabilityGate title="AI 剪辑" purpose={SINGLE_EDIT_PURPOSE}>
            {(capabilities) => <SingleEditPanel capabilities={capabilities} />}
          </AiStudioCapabilityGate>
        ) : (
          <ContentEditingWorkspace
            // The run's own 「查看 / 精修工程」 is the 精修 entry here; no second header button.
            renderHeader={() => (
              <header className={styles.pageHeader}>
                <div>
                  {/* Task details are reached from 成片 (both remix modes), so no mode tab is highlighted here. */}
                  <RouterLink className={annotationStyles.backLink} to={ROUTE_PATHS.contentAiStudioOutputs}>
                    <ArrowLeftOutlined aria-hidden /> 成片
                  </RouterLink>
                  <h1 id="ai-studio-page-title">任务详情</h1>
                  <p>{RUN_DETAIL_PURPOSE}</p>
                </div>
              </header>
            )}
          />
        )}
      </div>
    </AiStudioShell>
  );
}
