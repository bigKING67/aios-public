/**
 * Dashboard 类型聚合入口。
 *
 * 具体领域类型拆分在同目录的 `dashboard-*-types.ts` 中；业务模块继续从
 * `./dashboard-types` 引入，避免调用侧感知拆分细节。
 */
export * from './dashboard-page-types';
export * from './dashboard-overview-types';
export * from './dashboard-goods-types';
export * from './dashboard-traffic-types';
export * from './dashboard-live-types';
export * from './dashboard-short-video-types';
export * from './dashboard-qianchuan-types';
export * from './dashboard-goods-card-types';
export * from './dashboard-view-types';
