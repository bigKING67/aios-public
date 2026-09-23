/**
 * DataOps Hub 配置
 *
 * 数据来源：
 * - etl/groland_postgres/scripts/*.py
 * - etl/groland_postgres/scripts/deploy_prefect_*.sh
 *
 * 说明：
 * 1. 结构化静态配置用于描述 ETL 链路，避免运维信息散落在脚本内
 * 2. 本文件只承载页面元数据，给运行态页面避开整份静态配置的首屏导入
 */

export const DATAOPS_HUB_NAME = {
  pageName: '数据运维中心',
  englishName: 'DataOps Hub',
  menuName: '数据运维',
  path: '/ops/dataops',
} as const;
