export const CREATOR_SHORT_VIDEO_DETAIL_TABLE_COLUMN_CONFIG = {
  columns: {
    statDate: {
      title: '成交日期',
      dataIndex: 'stat_date',
      width: 112,
      fixed: 'left',
    },
    influencerName: {
      title: '达人',
      dataIndex: 'influencer_name',
      width: 176,
      fixed: 'left',
    },
    authorDouyinId: {
      title: '达人ID（抖音号）',
      dataIndex: 'author_douyin_id',
      width: 168,
      fixed: 'left',
    },
    videoTitle: {
      title: '罗盘视频标题',
      dataIndex: 'video_title',
      width: 220,
    },
    videoId: {
      title: '视频ID',
      dataIndex: 'video_id',
      width: 156,
    },
    contentAssetVideo: {
      title: '素材库视频',
      dataIndex: 'asset_ids',
      width: 148,
    },
    assetProductNames: {
      title: '产品',
      dataIndex: 'asset_product_names',
      width: 168,
    },
    assetOwnerNames: {
      title: '负责人',
      dataIndex: 'asset_owner_names',
      width: 136,
    },
    productId: {
      title: '商品ID',
      dataIndex: 'product_id',
      width: 156,
    },
    accountType: {
      title: '账号类型',
      dataIndex: 'account_type',
      width: 132,
    },
    accountTypes: {
      title: '账号类型集合',
      dataIndex: 'account_types',
      width: 176,
    },
    platform: {
      title: '平台',
      dataIndex: 'platform',
      width: 96,
    },
    cooperationStatus: {
      title: '挂车状态',
      dataIndex: 'cooperation_status',
      width: 132,
    },
    isPromoted: {
      title: '是否投流',
      dataIndex: 'is_promoted',
      width: 104,
    },
    publishTime: {
      title: '发布日期',
      dataIndex: 'publish_time',
      width: 152,
    },
    playUrl: {
      title: '播放URL',
      dataIndex: 'play_url',
      width: 220,
    },
    watchCount: {
      title: '罗盘观看数',
      dataIndex: 'video_view_count',
      width: 124,
    },
    userPayAmount: {
      title: '罗盘成交金额',
      dataIndex: 'user_pay_amount',
      width: 132,
    },
    refundAmount: {
      title: '罗盘退款金额（退款时间）',
      dataIndex: 'refund_amount',
      width: 132,
    },
    liveRoomPayAmount: {
      title: '引流直播间成交',
      dataIndex: 'live_room_pay_amount',
      width: 148,
    },
    searchAfterViewPayAmount: {
      title: '看后搜成交',
      dataIndex: 'search_after_view_pay_amount',
      width: 132,
    },
    shopPagePayAmount: {
      title: '引流店铺页成交',
      dataIndex: 'shop_page_pay_amount',
      width: 148,
    },
    tradeCreatedAt: {
      title: '罗盘创建时间',
      dataIndex: 'trade_created_at',
      width: 152,
    },
    tradeUpdatedAt: {
      title: '罗盘更新时间',
      dataIndex: 'trade_updated_at',
      width: 152,
    },
    tradeSourceIds: {
      title: '罗盘源ID',
      dataIndex: 'trade_source_ids',
      width: 160,
    },
    shopName: {
      title: '店铺名称',
      dataIndex: 'shop_name',
      width: 168,
    },
    shopId: {
      title: '店铺ID',
      dataIndex: 'shop_id',
      width: 132,
    },
    assetIds: {
      title: '素材库资产ID',
      dataIndex: 'asset_ids',
      width: 180,
    },
    platformVideoIds: {
      title: '素材库平台身份ID',
      dataIndex: 'platform_video_ids',
      width: 180,
    },
    adMaterialIds: {
      title: '素材库广告素材关系ID',
      dataIndex: 'ad_material_ids',
      width: 180,
    },
    qianchuanMaterialIds: {
      title: '千川素材ID',
      dataIndex: 'qianchuan_material_ids',
      width: 188,
    },
    qianchuanMaterialKey: {
      title: '千川素材Key',
      dataIndex: 'qianchuan_material_key',
      width: 168,
    },
    qianchuanMaterialCount: {
      title: '千川素材数',
      dataIndex: 'qianchuan_material_count',
      width: 112,
    },
    qianchuanMaterialVideoNames: {
      title: '千川素材视频名',
      dataIndex: 'qianchuan_material_video_names',
      width: 220,
    },
    qianchuanMaterialCreatedAtMin: {
      title: '素材最早创建',
      dataIndex: 'qianchuan_material_created_at_min',
      width: 152,
    },
    qianchuanMaterialCreatedAtMax: {
      title: '素材最晚创建',
      dataIndex: 'qianchuan_material_created_at_max',
      width: 152,
    },
    qianchuanImpressionCount: {
      title: '千川展现量',
      dataIndex: 'qianchuan_overall_impression_count',
      width: 124,
    },
    qianchuanClickCount: {
      title: '千川点击量',
      dataIndex: 'qianchuan_overall_click_count',
      width: 124,
    },
    qianchuanClickRate: {
      title: '千川点击率',
      dataIndex: 'qianchuan_overall_click_rate',
      width: 116,
    },
    qianchuanConversionRate: {
      title: '千川转化率',
      dataIndex: 'qianchuan_overall_conversion_rate',
      width: 116,
    },
    qianchuanCost: {
      title: '千川消耗',
      dataIndex: 'qianchuan_overall_cost',
      width: 124,
    },
    qianchuanOrderCount: {
      title: '千川成交订单',
      dataIndex: 'qianchuan_overall_order_count',
      width: 128,
    },
    qianchuanGmv: {
      title: '千川GMV',
      dataIndex: 'qianchuan_overall_gmv',
      width: 124,
    },
    qianchuanPayRoi: {
      title: '千川支付ROI',
      dataIndex: 'qianchuan_overall_pay_roi',
      width: 124,
    },
    qianchuanOrderCost: {
      title: '千川成交成本',
      dataIndex: 'qianchuan_overall_order_cost',
      width: 132,
    },
    qianchuanUserPayAmount: {
      title: '千川用户支付',
      dataIndex: 'qianchuan_user_pay_amount',
      width: 132,
    },
    qianchuanCpm: {
      title: '千川CPM',
      dataIndex: 'qianchuan_overall_cpm',
      width: 112,
    },
    qianchuanCpc: {
      title: '千川CPC',
      dataIndex: 'qianchuan_overall_cpc',
      width: 112,
    },
    qianchuanSmartCouponAmount: {
      title: '智能优惠券金额',
      dataIndex: 'qianchuan_smart_coupon_amount',
      width: 144,
    },
    qianchuanPlatformSubsidyAmount: {
      title: '平台补贴金额',
      dataIndex: 'qianchuan_platform_subsidy_amount',
      width: 132,
    },
    qianchuanNetGmvRoi: {
      title: '净GMV ROI',
      dataIndex: 'qianchuan_net_gmv_roi',
      width: 116,
    },
    qianchuanNetGmv: {
      title: '净GMV',
      dataIndex: 'qianchuan_net_gmv',
      width: 124,
    },
    qianchuanNetOrderCount: {
      title: '净订单',
      dataIndex: 'qianchuan_net_order_count',
      width: 108,
    },
    qianchuanNetOrderCost: {
      title: '净成交成本',
      dataIndex: 'qianchuan_net_order_cost',
      width: 124,
    },
    qianchuanNetGmvSettlementRate: {
      title: '净GMV结算率',
      dataIndex: 'qianchuan_net_gmv_settlement_rate',
      width: 132,
    },
    qianchuanRefundRate1h: {
      title: '1小时退款率',
      dataIndex: 'qianchuan_refund_rate_1h',
      width: 120,
    },
    qianchuanSourceFileNames: {
      title: '千川来源文件',
      dataIndex: 'qianchuan_source_file_names',
      width: 220,
    },
    qianchuanSourceIds: {
      title: '千川源ID',
      dataIndex: 'qianchuan_source_ids',
      width: 180,
    },
    qianchuanIngestTime: {
      title: '千川入库时间',
      dataIndex: 'qianchuan_ingest_time',
      width: 152,
    },
    qianchuanMetricAttributed: {
      title: '千川已归因',
      dataIndex: 'qianchuan_metric_attributed',
      width: 112,
    },
    qianchuanAttributionRank: {
      title: '归因排序',
      dataIndex: 'qianchuan_attribution_rank',
      width: 104,
    },
    mappingStatus: {
      title: '映射状态',
      dataIndex: 'mapping_status',
      width: 168,
    },
    qianchuanMatchStatus: {
      title: '千川匹配状态',
      dataIndex: 'qianchuan_match_status',
      width: 168,
    },
    tradeSourceUpdatedAt: {
      title: '罗盘源更新时间',
      dataIndex: 'trade_source_updated_at',
      width: 152,
    },
    qianchuanSourceUpdatedAt: {
      title: '千川源更新时间',
      dataIndex: 'qianchuan_source_updated_at',
      width: 152,
    },
    sourceMaxUpdatedAt: {
      title: '源最大更新时间',
      dataIndex: 'source_max_updated_at',
      width: 152,
    },
    detailCreatedAt: {
      title: '明细创建时间',
      dataIndex: 'created_at',
      width: 152,
    },
    detailUpdatedAt: {
      title: '明细更新时间',
      dataIndex: 'updated_at',
      width: 152,
    },
    sourceName: {
      title: '数据来源',
      dataIndex: 'source_file_name',
      width: 176,
    },
    sourceUpdatedAt: {
      title: '更新时间',
      dataIndex: 'source_etl_loaded_at',
      width: 168,
    },
  },
} as const;
