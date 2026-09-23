import inspectorStyles from './content-assets-inspector.module.css';
import pageStyles from './content-assets-inspector-page.module.css';
import workbenchStyles from './content-assets-detail-workbench.module.css';

export function ContentAssetDetailWorkbenchSkeleton({ className }: { className?: string }) {
  return (
    <section className={className} aria-label="素材详情加载中">
      <div className={pageStyles.workbenchStack}>
        <section className={pageStyles.overviewGrid}>
          <div className={pageStyles.mediaColumn} aria-label="素材媒体预览加载中">
            <div className={`${inspectorStyles.playerCard} ${pageStyles.playerFrame} ${pageStyles.playerFrameHero}`}>
              <div className={`${pageStyles.skeletonVideo} ${pageStyles.skeletonVideoHero}`} />
            </div>
          </div>
          <aside className={workbenchStyles.detailColumn} aria-label="素材业务摘要加载中">
            <section className={workbenchStyles.signalPanel}>
              <div className={workbenchStyles.summaryBlock}>
                <div className={workbenchStyles.summaryHeader}>
                  <SkeletonLine size="sm" />
                  <SkeletonLine size="md" />
                </div>
                <SkeletonParagraph rows={3} />
              </div>
              <div className={workbenchStyles.healthGrid}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className={workbenchStyles.metricCell} key={index}>
                    <SkeletonLine size="sm" />
                    <SkeletonLine />
                  </div>
                ))}
              </div>
            </section>
            <section className={workbenchStyles.heroPanel}>
              <div className={workbenchStyles.actionCluster}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div className={pageStyles.skeletonButton} key={index} />
                ))}
              </div>
            </section>
            <section className={workbenchStyles.scriptPreviewPanel}>
              <div className={workbenchStyles.scriptPreviewHeader}>
                <SkeletonLine size="sm" />
                <SkeletonLine size="md" />
              </div>
              <SkeletonParagraph rows={5} />
            </section>
            <section className={workbenchStyles.nextActionPanel}>
              <SkeletonLine size="sm" />
              <SkeletonLine />
              <SkeletonParagraph rows={2} />
            </section>
          </aside>
        </section>
        <section className={pageStyles.workflowPanel}>
          {Array.from({ length: 5 }).map((_, index) => (
            <article className={pageStyles.workflowItem} key={index}>
              <div className={pageStyles.skeletonWorkflowIcon} />
              <div>
                <SkeletonLine size="sm" />
                <SkeletonLine />
              </div>
            </article>
          ))}
        </section>
        <section className={pageStyles.contextPanel}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <SkeletonLine size="sm" />
              <SkeletonLine />
            </div>
          ))}
        </section>
        <section className={pageStyles.detailTabs}>
          <div className={pageStyles.skeletonTabRow}>
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonPill key={index} />
            ))}
          </div>
          <SkeletonParagraph rows={8} />
        </section>
      </div>
    </section>
  );
}

function SkeletonLine({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return <span className={`${pageStyles.skeletonBlock} ${pageStyles[`skeletonLine${size.toUpperCase()}`]}`} />;
}

function SkeletonPill() {
  return <span className={`${pageStyles.skeletonBlock} ${pageStyles.skeletonPill}`} />;
}

function SkeletonParagraph({ rows }: { rows: number }) {
  return (
    <div className={pageStyles.skeletonParagraph}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonLine key={index} size={index === rows - 1 ? 'md' : 'lg'} />
      ))}
    </div>
  );
}
