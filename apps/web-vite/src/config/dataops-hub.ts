/**
 * DataOps Hub 配置
 *
 * 数据来源：
 * - etl/groland_postgres/scripts/*.py
 * - etl/groland_postgres/scripts/deploy_prefect_*.sh
 *
 * 说明：
 * 1. 结构化静态配置用于描述 ETL 链路，避免运维信息散落在脚本内
 * 2. 前端运行态页面以 DataOps Runtime 接口为准；静态配置主要供导出、
 *    文档和离线校验使用，避免把整份配置带入首屏 bundle
 */

export * from './dataops-hub-types';
export { DATAOPS_HUB_NAME } from './dataops-hub-metadata';
export { DATAOPS_PIPELINES } from './dataops-hub-pipelines';
export { DATA_SYNC_STREAMS } from './dataops-hub-streams';
export {
  DATAOPS_AUDIT_EVENTS,
  DATAOPS_NOTIFICATION_CHANNELS,
  DATAOPS_NOTIFICATION_EVENTS,
} from './dataops-hub-notifications';
