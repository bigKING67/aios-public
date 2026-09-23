const REPORT_BASES = Object.freeze([
  'all_trade_week_platform_metrics',
  'douyin_trade_sale_metrics_week',
  'douyin_trade_sale_channel_metrics_week',
  'douyin_trade_sale_live_metrics_week',
  'douyin_trade_sale_shortvideo_metrics_week',
  'douyin_trade_sale_card_metrics_week',
  'taobao_trade_product_metrics_week',
  'taobao_goods_traffic_channel_metrics_week',
  'taobao_one_goods_traffic_channel_metric_week',
]);

function frozenMappings(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

const reportRelations = REPORT_BASES.flatMap((base) => [
  {
    current: `ads.report_${base}`,
    family: 'dynamic_report_rename',
    old: `ads.${base}`,
  },
  {
    current: `etl.report_${base}_refresh_state`,
    family: 'dynamic_report_rename',
    old: `etl.${base}_refresh_state`,
  },
]);

const reportRoutines = REPORT_BASES.flatMap((base) => [
  {
    current: `ads.refresh_report_${base}(date,date)`,
    currentDefinitionNeedles: Object.freeze([`ads.report_${base}`]),
    family: 'dynamic_report_rename',
    old: `ads.refresh_${base}(date,date)`,
  },
  {
    current: `ads.refresh_report_${base}_incremental(integer,boolean)`,
    currentDefinitionNeedles: Object.freeze([
      `refresh_report_${base}`,
      `etl.report_${base}_refresh_state`,
    ]),
    family: 'dynamic_report_rename',
    old: `ads.refresh_${base}_incremental(integer,boolean)`,
  },
]);

export const QIANCHUAN_P1C_CATALOG_MAPPINGS = Object.freeze({
  relations: frozenMappings([
    ...reportRelations,
    {
      current: 'ads.influencer_live_detail',
      family: 'creator_live_rename',
      old: 'ads.creator_live_trade_daily',
    },
    {
      current: 'ads.influencer_live_roster',
      family: 'creator_live_rename',
      old: 'ads.creator_live_influencer_roster',
    },
    {
      current: 'ads.douyin_live_detail',
      family: 'live_dashboard_replacement',
      old: 'ads.douyin_live_dashboard_daily',
    },
    {
      current: 'etl.douyin_live_detail_refresh_state',
      family: 'live_dashboard_replacement',
      old: 'etl.douyin_live_dashboard_daily_refresh_state',
    },
    {
      current: 'ads.douyin_self_anchor_map',
      family: 'live_dashboard_replacement',
      old: 'ads.douyin_live_self_anchor_map',
    },
    {
      current: 'ads.douyin_shortvideo_detail',
      family: 'shortvideo_detail_evolution',
      old: null,
    },
    {
      current: 'etl.douyin_shortvideo_detail_refresh_state',
      family: 'shortvideo_detail_evolution',
      old: null,
    },
  ]),
  routines: frozenMappings([
    ...reportRoutines,
    {
      current: 'ads.refresh_creator_live_trade_daily(date,date)',
      currentDefinitionNeedles: Object.freeze(['ads.influencer_live_detail']),
      family: 'creator_live_rename',
      old: null,
    },
    {
      current: 'ads.refresh_creator_live_influencer_roster()',
      currentDefinitionNeedles: Object.freeze(['ads.influencer_live_roster']),
      family: 'creator_live_rename',
      old: null,
    },
    {
      current: 'ads.refresh_douyin_live_detail(date,date)',
      currentDefinitionNeedles: Object.freeze(['ads.douyin_live_detail']),
      family: 'live_dashboard_replacement',
      old: 'ads.refresh_douyin_live_dashboard_daily(date,date)',
    },
    {
      current: 'ads.refresh_douyin_live_detail_incremental(integer,boolean)',
      currentDefinitionNeedles: Object.freeze([
        'refresh_douyin_live_detail',
        'etl.douyin_live_detail_refresh_state',
      ]),
      family: 'live_dashboard_replacement',
      old: 'ads.refresh_douyin_live_dashboard_daily_incremental(integer,boolean)',
    },
    {
      current: 'ads.refresh_douyin_shortvideo_detail(date,date)',
      currentDefinitionNeedles: Object.freeze(['ads.douyin_shortvideo_detail']),
      family: 'shortvideo_detail_evolution',
      old: null,
    },
    {
      current: 'ads.refresh_douyin_shortvideo_detail_incremental(integer,boolean)',
      currentDefinitionNeedles: Object.freeze([
        'refresh_douyin_shortvideo_detail',
        'etl.douyin_shortvideo_detail_refresh_state',
      ]),
      family: 'shortvideo_detail_evolution',
      old: null,
    },
  ]),
  indexes: frozenMappings([
    {
      current: 'ads.idx_influencer_live_detail_platform_influencer_date',
      currentTable: 'ads.influencer_live_detail',
      family: 'creator_live_rename',
      old: 'ads.idx_creator_live_trade_daily_platform_anchor_date',
    },
    {
      current: 'ads.idx_influencer_live_roster_platform_influencer_id',
      currentTable: 'ads.influencer_live_roster',
      family: 'creator_live_rename',
      old: 'ads.idx_creator_live_influencer_roster_platform_influencer_id',
    },
    {
      current: 'ads.idx_douyin_live_detail_stat_date',
      currentTable: 'ads.douyin_live_detail',
      family: 'live_dashboard_replacement',
      old: 'ads.idx_douyin_live_dashboard_daily_stat_date',
    },
    {
      current: 'ads.idx_douyin_live_detail_identity_stat_date',
      currentTable: 'ads.douyin_live_detail',
      family: 'live_dashboard_replacement',
      old: 'ads.idx_douyin_live_dashboard_daily_identity_date',
    },
    {
      current: 'ads.idx_douyin_live_detail_anchor_start_time',
      currentTable: 'ads.douyin_live_detail',
      family: 'live_dashboard_replacement',
      old: 'ads.idx_douyin_live_dashboard_daily_anchor_date',
    },
    {
      current: 'ads.idx_douyin_shortvideo_detail_mapping_status',
      currentTable: 'ads.douyin_shortvideo_detail',
      family: 'shortvideo_detail_evolution',
      old: 'ads.idx_douyin_shortvideo_detail_identity_stat_date',
    },
    {
      current: 'ads.idx_douyin_shortvideo_detail_qianchuan_material_key',
      currentTable: 'ads.douyin_shortvideo_detail',
      family: 'shortvideo_detail_evolution',
      old: 'ads.idx_douyin_shortvideo_detail_author_type_stat_date',
    },
  ]),
});

export function qianchuanP1cCatalogMappingsForFamily(family) {
  return {
    relations: QIANCHUAN_P1C_CATALOG_MAPPINGS.relations.filter((entry) => entry.family === family),
    routines: QIANCHUAN_P1C_CATALOG_MAPPINGS.routines.filter((entry) => entry.family === family),
    indexes: QIANCHUAN_P1C_CATALOG_MAPPINGS.indexes.filter((entry) => entry.family === family),
  };
}
