use super::normalizer::{MissingColumn, MissingRelation};

pub(super) const GOODS_RELATIONS: &[MissingRelation] = &[MissingRelation {
    name: "taobao_trade_sale_goods_daily",
    message: "目标表不存在：请先执行 taobao_trade_sale_goods_daily 相关迁移。",
}];

pub(super) const TRAFFIC_RELATIONS: &[MissingRelation] = &[MissingRelation {
    name: "taobao_traffic_shop_daily",
    message: "目标表不存在：请先执行 taobao_traffic_shop_daily 相关迁移。",
}];

pub(super) const TRAFFIC_GOODS_RELATIONS: &[MissingRelation] = &[MissingRelation {
    name: "taobao_traffic_goods_daily",
    message: "目标表不存在：请先执行 taobao_traffic_goods_daily 相关迁移。",
}];

pub(super) const GOODS_CARD_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_trade_sale_card_raw",
        message: "商品卡 ODS 主表不存在：请先确认 ods.douyin_trade_sale_card_raw 已完成同步。",
    },
    MissingRelation {
        name: "douyin_trade_sale_card",
        message: "商品卡 ADS 主表不存在：请先执行 20260428_1600 商品卡看板迁移。",
    },
];

pub(super) const GOODS_CARD_TRAFFIC_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_trade_sale_card_detail_raw",
        message: "商品卡流量来源 ODS 表不存在：请先确认 ods.douyin_trade_sale_card_detail_raw 已完成同步。",
    },
    MissingRelation {
        name: "douyin_trade_sale_card_detail",
        message: "商品卡流量来源 ADS 表不存在：请先执行 20260428_1600 商品卡看板迁移。",
    },
];

pub(super) const LIVE_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_live_detail",
        message: "直播明细事实表不存在：请先执行 20260423_1600 及后续相关迁移。",
    },
    MissingRelation {
        name: "douyin_self_anchor_map",
        message: "抖音自营映射表不存在：请先执行 20260424_1100 及后续相关迁移。",
    },
];

pub(super) const LIVE_GOODS_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_live_goods_detail",
        message: "直播商品明细事实表不存在：请先执行 20260427_1500 及后续相关迁移。",
    },
    MissingRelation {
        name: "douyin_livestream_goods",
        message: "直播商品 ODS 表不存在：请先确认 ods.douyin_livestream_goods 已完成同步。",
    },
];

pub(super) const SHORTVIDEO_RELATIONS: &[MissingRelation] = &[MissingRelation {
    name: "douyin_shortvideo_detail",
    message: "短视频明细事实表不存在：请先执行 20260608_1730 及后续相关迁移。",
}];

pub(super) const QIANCHUAN_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_qianchuan_live_all_domain_material_daily",
        message: "千川直播全域ADS事实表不存在：请先执行 20260618_1830 千川直播全域看板迁移并刷新数据。",
    },
    MissingRelation {
        name: "douyin_qianchuan_live_room_screen_raw",
        message: "千川直播间画面ODS表不存在：请先确认 ods.douyin_qianchuan_live_room_screen_raw 已完成同步。",
    },
    MissingRelation {
        name: "douyin_qianchuan_live_video_raw",
        message: "千川直播视频ODS表不存在：请先确认 ods.douyin_qianchuan_live_video_raw 已完成同步。",
    },
];

pub(super) const CREATOR_SHORTVIDEO_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "douyin_shortvideo_detail",
        message: "抖音短视频统一明细事实表不存在：请先执行 20260608_1730 及后续相关迁移。",
    },
    MissingRelation {
        name: "douyin_shortvideo_creator_manual_attrs",
        message: "短视频达人人工维护表不存在：请先执行 20260608_1830 及后续相关迁移。",
    },
];

const CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE: &str =
    "短视频达人看板字段缺失：请先执行 20260609_1800、20260609_1900、20260609_2130 等短视频明细字段迁移。";

pub(super) const CREATOR_SHORTVIDEO_COLUMNS: &[MissingColumn] = &[
    MissingColumn {
        name: "asset_product_names",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
    MissingColumn {
        name: "asset_owner_names",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
    MissingColumn {
        name: "asset_video_types",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
    MissingColumn {
        name: "asset_content_scenes",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
    MissingColumn {
        name: "asset_content_scene_groups",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
    MissingColumn {
        name: "asset_content_scene_subtypes",
        message: CREATOR_SHORTVIDEO_TAXONOMY_COLUMN_MESSAGE,
    },
];

pub(super) const CREATOR_LIVE_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "influencer_live_roster",
        message: "直播达人名册表不存在：请先执行 20260331_1130 及后续相关迁移。",
    },
    MissingRelation {
        name: "influencer_live_detail",
        message: "直播达人日事实表不存在：请先执行 20260331_1130 及后续相关迁移。",
    },
];

pub(super) const OVERVIEW_RELATIONS: &[MissingRelation] = &[
    MissingRelation {
        name: "all_trade_overview_refund_nowcast_quality_daily",
        message: "nowcast 质量表不存在：请先执行 20260326_0910 及后续相关迁移。",
    },
    MissingRelation {
        name: "all_trade_overview_refund_nowcast_daily",
        message: "nowcast 表不存在：请先执行 20260325_2310 及后续相关迁移。",
    },
    MissingRelation {
        name: "all_trade_overview",
        message: "目标表不存在：请先执行 all_trade_overview 相关迁移。",
    },
];
