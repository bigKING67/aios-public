/**
 * DataOps Hub Pipeline 配置聚合入口。
 *
 * 具体 pipeline 按使用场景拆分，调用侧继续从此文件读取统一顺序。
 */

import { DATAOPS_DASHBOARD_PIPELINES } from './dataops-hub-dashboard-pipelines';
import { DATAOPS_OPS_PIPELINES } from './dataops-hub-ops-pipelines';
import { DATAOPS_REPORT_PIPELINES } from './dataops-hub-report-pipelines';
import type { DataOpsPipeline } from './dataops-hub-types';

export const DATAOPS_PIPELINES: DataOpsPipeline[] = [
  ...DATAOPS_DASHBOARD_PIPELINES,
  ...DATAOPS_REPORT_PIPELINES,
  ...DATAOPS_OPS_PIPELINES,
];
