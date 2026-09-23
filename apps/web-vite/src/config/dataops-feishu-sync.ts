import type { DataOpsRuntimeFeishuSyncJob } from '@/types/dataops';

export const FEISHU_SYNC_TARGET_LABEL = '飞书多维表';
export const FEISHU_SYNC_HEALTHY_LAG_MINUTES = 24 * 60;
export const FEISHU_SYNC_WARNING_LAG_MINUTES = 48 * 60;

export interface DataOpsFeishuSyncServiceDefinition
  extends Pick<
    DataOpsRuntimeFeishuSyncJob,
    'id' | 'serviceName' | 'jobName' | 'sourceTable' | 'note'
  > {
  cliFlag?: string;
}

export const FEISHU_SYNC_SERVICE_DEFINITIONS: DataOpsFeishuSyncServiceDefinition[] = [
  {
    id: 'feishu_sync_ods_douyin_trade_sale_raw',
    serviceName: 'ods.douyin_trade_sale_raw',
    jobName: '飞书同步-抖音全店成交明细',
    sourceTable: 'ods.douyin_trade_sale_raw',
    cliFlag: '--douyin-trade-sale',
  },
  {
    id: 'feishu_sync_ods_douyin_trade_sale_live_raw',
    serviceName: 'ods.douyin_trade_sale_live_raw',
    jobName: '飞书同步-抖音全店成交直播明细',
    sourceTable: 'ods.douyin_trade_sale_live_raw',
    cliFlag: '--douyin-trade-sale-live',
  },
  {
    id: 'feishu_sync_ods_douyin_trade_sale_card_raw',
    serviceName: 'ods.douyin_trade_sale_card_raw',
    jobName: '飞书同步-抖音商品卡成交明细',
    sourceTable: 'ods.douyin_trade_sale_card_raw',
    cliFlag: '--douyin-trade-sale-card',
  },
  {
    id: 'feishu_sync_ods_taobao_trade_sale_raw',
    serviceName: 'ods.taobao_trade_sale_raw',
    jobName: '飞书同步-天猫全店交易数据',
    sourceTable: 'ods.taobao_trade_sale_raw',
    cliFlag: '--taobao-trade-sale',
  },
  {
    id: 'feishu_sync_ods_xhs_trade_sale_raw',
    serviceName: 'ods.xhs_trade_sale_raw',
    jobName: '飞书同步-小红书店铺交易数据',
    sourceTable: 'ods.xhs_trade_sale_raw',
    cliFlag: '--xhs-trade-sale',
  },
  {
    id: 'feishu_sync_ods_taobao_one_alimama_marketingscenario',
    serviceName: 'ods.taobao_one_alimama_marketingscenario',
    jobName: '飞书同步-淘宝阿里妈妈场景营销',
    sourceTable: 'ods.taobao_one_alimama_marketingscenario',
    cliFlag: '--taobao-alimama-scenario',
  },
  {
    id: 'feishu_sync_ods_jd_trade_sale_raw',
    serviceName: 'ods.jd_trade_sale_raw',
    jobName: '飞书同步-京东店铺成交数据',
    sourceTable: 'ods.jd_trade_sale_raw',
    cliFlag: '--jd-trade-sale',
  },
  {
    id: 'feishu_sync_ods_wx_trade_sale_raw',
    serviceName: 'ods.wx_trade_sale_raw',
    jobName: '飞书同步-微信小程序店铺成交数据',
    sourceTable: 'ods.wx_trade_sale_raw',
    cliFlag: '--wx-trade-sale',
  },
];

const FEISHU_SYNC_SERVICE_DEFINITION_MAP = new Map(
  FEISHU_SYNC_SERVICE_DEFINITIONS.map((item) => [item.serviceName, item])
);

export function getFeishuSyncServiceDefinition(
  serviceName: string
): DataOpsFeishuSyncServiceDefinition | null {
  const normalized = serviceName.trim();
  if (!normalized) {
    return null;
  }

  return FEISHU_SYNC_SERVICE_DEFINITION_MAP.get(normalized) || null;
}

export function listFeishuSyncServiceNames(): string[] {
  return FEISHU_SYNC_SERVICE_DEFINITIONS.map((item) => item.serviceName);
}
