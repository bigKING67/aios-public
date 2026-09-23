use super::normalizer::ErrorMessageSpec;
use super::relations::{
    CREATOR_LIVE_RELATIONS, CREATOR_SHORTVIDEO_COLUMNS, CREATOR_SHORTVIDEO_RELATIONS,
    GOODS_CARD_RELATIONS, GOODS_CARD_TRAFFIC_RELATIONS, GOODS_RELATIONS, LIVE_GOODS_RELATIONS,
    LIVE_RELATIONS, OVERVIEW_RELATIONS, QIANCHUAN_RELATIONS, SHORTVIDEO_RELATIONS,
    TRAFFIC_GOODS_RELATIONS, TRAFFIC_RELATIONS,
};

pub(super) const GOODS_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.taobao_trade_sale_goods_daily 的权限。",
    psql_message: "商品经营数据查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "商品经营数据查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: GOODS_RELATIONS,
    missing_columns: &[],
};

pub(super) const TRAFFIC_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.taobao_traffic_shop_daily 的权限。",
    psql_message: "流量维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "流量维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: TRAFFIC_RELATIONS,
    missing_columns: &[],
};

pub(super) const TRAFFIC_GOODS_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.taobao_traffic_goods_daily 的权限。",
    psql_message: "商品流量维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "商品流量维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: TRAFFIC_GOODS_RELATIONS,
    missing_columns: &[],
};

pub(super) const GOODS_CARD_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.douyin_trade_sale_card 的权限。",
    psql_message: "商品卡维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "商品卡维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: GOODS_CARD_RELATIONS,
    missing_columns: &[],
};

pub(super) const GOODS_CARD_TRAFFIC_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.douyin_trade_sale_card_detail 的权限。",
    psql_message: "商品卡流量来源查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "商品卡流量来源查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: GOODS_CARD_TRAFFIC_RELATIONS,
    missing_columns: &[],
};

pub(super) const LIVE_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message: "数据库权限不足：请检查当前账号是否有查询 ads.douyin_live_detail 的权限。",
    psql_message: "直播维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "直播维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: LIVE_RELATIONS,
    missing_columns: &[],
};

pub(super) const LIVE_GOODS_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.douyin_live_goods_detail 的权限。",
    psql_message: "直播商品维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "直播商品维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: LIVE_GOODS_RELATIONS,
    missing_columns: &[],
};

pub(super) const SHORTVIDEO_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.douyin_shortvideo_detail 的权限。",
    psql_message: "短视频维度查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "短视频维度查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: SHORTVIDEO_RELATIONS,
    missing_columns: &[],
};

pub(super) const QIANCHUAN_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询 ads.douyin_qianchuan_live_all_domain_material_daily 的权限。",
    psql_message: "千川直播全域数据查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "千川直播全域数据加载失败：请检查 ADS 千川直播全域事实表刷新状态。",
    missing_database_message: None,
    missing_relations: QIANCHUAN_RELATIONS,
    missing_columns: &[],
};

pub(super) const CREATOR_SHORTVIDEO_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message:
        "数据库权限不足：请检查当前账号是否有查询/写入短视频达人看板相关 ADS 表的权限。",
    psql_message: "短视频达人看板查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "短视频达人看板查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: CREATOR_SHORTVIDEO_RELATIONS,
    missing_columns: CREATOR_SHORTVIDEO_COLUMNS,
};

pub(super) const CREATOR_LIVE_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message: "数据库权限不足：请检查当前账号是否有查询 ads.influencer_live_* 表的权限。",
    psql_message: "直播达人看板查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "直播达人看板查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: None,
    missing_relations: CREATOR_LIVE_RELATIONS,
    missing_columns: &[],
};

pub(super) const OVERVIEW_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message: "数据库权限不足：请检查当前账号是否有查询 ads.all_trade_overview 的权限。",
    psql_message: "看板数据查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "看板数据查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: Some("数据库不存在：请检查 PGDATABASE 是否指向业务库。"),
    missing_relations: OVERVIEW_RELATIONS,
    missing_columns: &[],
};

pub(super) const OVERVIEW_DETAILS_SPEC: ErrorMessageSpec = ErrorMessageSpec {
    permission_message: "数据库权限不足：请检查当前账号是否有查询 ads.all_trade_overview 的权限。",
    psql_message: "看板明细查询失败：请联系管理员检查数据库连接配置。",
    fallback_message: "看板明细查询失败：请稍后重试，若持续失败请联系管理员。",
    missing_database_message: Some("数据库不存在：请检查 PGDATABASE 是否指向业务库。"),
    missing_relations: OVERVIEW_RELATIONS,
    missing_columns: &[],
};
