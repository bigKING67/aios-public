import {
  Component,
  Suspense,
  lazy,
  type ReactNode,
} from 'react';

import type { DashboardBusinessContentLazyProps } from './dashboard-business-content-lazy';
import type { DashboardCommerceContentLazyProps } from './dashboard-commerce-content-lazy';
import type { DashboardMediaContentLazyProps } from './dashboard-media-content-lazy';
import type { DashboardQianchuanContentLazyProps } from './dashboard-qianchuan-content-lazy';
import placeholderContentStyles from './dashboard-dimension-placeholder-content.module.css';
import placeholderStyles from './dashboard-dimension-placeholder.module.css';

const DashboardBusinessContentLazy = lazy(() => import('./dashboard-business-content-lazy'));
const DashboardMediaContentLazy = lazy(() => import('./dashboard-media-content-lazy'));
const DashboardCommerceContentLazy = lazy(() => import('./dashboard-commerce-content-lazy'));
const DashboardQianchuanContentLazy = lazy(() => import('./dashboard-qianchuan-content-lazy'));

type DashboardLazyContentBoundaryProps = {
  label: string;
  children: ReactNode;
};

type DashboardLazyContentErrorBoundaryState = {
  hasError: boolean;
};

class DashboardLazyContentErrorBoundary extends Component<
  DashboardLazyContentBoundaryProps,
  DashboardLazyContentErrorBoundaryState
> {
  state: DashboardLazyContentErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): DashboardLazyContentErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <DashboardLazyContentStatus
          title={`${this.props.label}加载失败`}
          description="请刷新页面重试。"
          ariaBusy={false}
        />
      );
    }

    return this.props.children;
  }
}

function DashboardLazyContentStatus({
  title,
  description,
  ariaBusy,
}: {
  title: string;
  description: string;
  ariaBusy: boolean;
}) {
  return (
    <section
      className={placeholderStyles.dimensionPlaceholderPanel}
      aria-busy={ariaBusy}
      aria-live="polite"
    >
      <div className={placeholderStyles.dimensionPlaceholderHeader}>
        <h3 className={placeholderContentStyles.dimensionPlaceholderTitle}>{title}</h3>
        <p className={placeholderContentStyles.dimensionPlaceholderDescription}>
          {description}
        </p>
      </div>
    </section>
  );
}

function DashboardLazyContentBoundary({
  label,
  children,
}: DashboardLazyContentBoundaryProps) {
  return (
    <DashboardLazyContentErrorBoundary key={label} label={label}>
      <Suspense
        fallback={
          <DashboardLazyContentStatus
            title={`正在加载${label}`}
            description="正在按需载入，筛选条件保持不变。"
            ariaBusy
          />
        }
      >
        {children}
      </Suspense>
    </DashboardLazyContentErrorBoundary>
  );
}

export function DashboardBusinessContentBoundary(props: DashboardBusinessContentLazyProps) {
  return (
    <DashboardLazyContentBoundary label="经营总览">
      <DashboardBusinessContentLazy {...props} />
    </DashboardLazyContentBoundary>
  );
}

export function DashboardMediaContentBoundary(props: DashboardMediaContentLazyProps) {
  const label = props.contentKind === 'live' ? '直播内容' : '短视频内容';

  return (
    <DashboardLazyContentBoundary label={label}>
      <DashboardMediaContentLazy {...props} />
    </DashboardLazyContentBoundary>
  );
}

export function DashboardCommerceContentBoundary(props: DashboardCommerceContentLazyProps) {
  const labels: Record<DashboardCommerceContentLazyProps['contentKind'], string> = {
    goods: '商品内容',
    traffic: '流量内容',
    goodsCard: '商品卡内容',
  };

  return (
    <DashboardLazyContentBoundary label={labels[props.contentKind]}>
      <DashboardCommerceContentLazy {...props} />
    </DashboardLazyContentBoundary>
  );
}

export function DashboardQianchuanContentBoundary(props: DashboardQianchuanContentLazyProps) {
  return (
    <DashboardLazyContentBoundary label="千川直播全域">
      <DashboardQianchuanContentLazy {...props} />
    </DashboardLazyContentBoundary>
  );
}
