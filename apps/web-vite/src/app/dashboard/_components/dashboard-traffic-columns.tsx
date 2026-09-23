/**
 * Dashboard traffic table column 聚合入口。
 *
 * 调用侧从 `dashboard-traffic-columns` 引入；内部按 classNames、
 * shared renderers、总览流量、商品流量与单品卡流量列构建拆分。
 */
export {
  buildDashboardGoodsCardTrafficColumns,
} from './dashboard-goods-card-traffic-columns';
export {
  buildDashboardTrafficGoodsColumns,
} from './dashboard-traffic-goods-columns';
export {
  buildDashboardTrafficColumns,
} from './dashboard-traffic-main-columns';
export type {
  DashboardTrafficTableClassNames,
} from './dashboard-traffic-table-class-names';
