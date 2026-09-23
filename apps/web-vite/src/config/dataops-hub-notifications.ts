/**
 * DataOps Hub 配置
 *
 * 数据来源：
 * - etl/groland_postgres/scripts/*.py
 * - etl/groland_postgres/scripts/deploy_prefect_*.sh
 *
 * 说明：
 * 1. 结构化静态配置用于描述 ETL 链路，避免运维信息散落在脚本内
 * 2. 运行时页面优先使用后端 DataOps Runtime 接口，接口无数据时回退到这份静态配置
 */

import type {
  DataOpsAuditEvent,
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from './dataops-hub-types';

export const DATAOPS_NOTIFICATION_CHANNELS: DataOpsNotificationChannel[] = [
  {
    id: 'feishu_default_bot',
    channelName: 'Groland Aios运维机器人',
    protocol: 'webhook',
    provider: 'feishu',
    endpointMasked: 'https://open.feishu.cn/open-apis/bot/v2/hook/f7da****62f3',
    enabled: true,
    status: 'healthy',
    retryPolicy: '指数退避，最多 4 次',
    lastDeliveredAt: '2026-02-28 14:37',
    failureCount24h: 0,
  },
  {
    id: 'feishu_dataops_backup',
    channelName: 'Groland运营部机器人',
    protocol: 'webhook',
    provider: 'feishu',
    endpointMasked: 'https://open.feishu.cn/open-apis/bot/v2/hook/11b6****b898',
    enabled: false,
    status: 'paused',
    retryPolicy: '停用中',
    failureCount24h: 0,
  },
];

export const DATAOPS_NOTIFICATION_EVENTS: DataOpsNotificationEvent[] = [
  {
    id: 'evt_1001',
    channelId: 'feishu_default_bot',
    level: 'info',
    eventType: 'pipeline_succeeded',
    title: 'ADS 全渠道日经营总览增量刷新通知',
    targetTable: 'ads.all_trade_overview',
    flowName: 'incremental-refresh-ads-all-trade-overview-flow',
    status: 'sent',
    sentAt: '2026-03-03 23:00',
    detail: '核心交易底座刷新成功，周/月 report 视图同步可见。',
  },
  {
    id: 'evt_1002',
    channelId: 'feishu_default_bot',
    level: 'warning',
    eventType: 'report_consistency_check',
    title: '周报视图一致性提醒',
    targetTable: 'ads.report_all_trade_week / ads.report_all_trade_month',
    flowName: 'incremental-refresh-ads-all-trade-overview-flow',
    status: 'sent',
    sentAt: '2026-03-03 23:01',
    detail: 'report 周/月视图统一读取 ads.all_trade_overview，发现差异时优先检查 overview 水位。',
  },
  {
    id: 'evt_1005',
    channelId: 'feishu_default_bot',
    level: 'info',
    eventType: 'pipeline_succeeded',
    title: '周报平台扩展指标增量刷新通知',
    targetTable: 'ads.report_all_trade_week_platform_metrics',
    flowName: 'incremental-refresh-ads-report-all-trade-week-platform-metrics-flow',
    status: 'sent',
    sentAt: '2026-02-28 14:35',
    detail: '窗口刷新成功，新增 1，更新 1，删除 0。',
  },
];

export const DATAOPS_AUDIT_EVENTS: DataOpsAuditEvent[] = [
  {
    id: 'audit_101',
    action: '更新部署 Cron',
    operator: 'gao.qian',
    scope: 'ads-01-overview-daily-inc',
    result: '成功',
    eventAt: '2026-02-28 09:45',
    detail: '交易 report 周/月视图收敛到 overview 底座，调度只保留 overview 物理刷新。',
  },
  {
    id: 'audit_102',
    action: '手动触发增量刷新',
    operator: 'ops.bot',
    scope: 'incremental-refresh-ads-report-all-trade-week-platform-metrics-flow',
    result: '成功',
    eventAt: '2026-02-28 08:12',
    detail: '手动触发回补，执行耗时 71s。',
  },
  {
    id: 'audit_103',
    action: 'Webhook 通道健康检查',
    operator: 'platform.alert',
    scope: 'feishu_default_bot',
    result: '失败',
    eventAt: '2026-02-28 11:39',
    detail: '目标端超时，自动重试后恢复。',
  },
];
