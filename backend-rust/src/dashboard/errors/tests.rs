use super::{
    normalize_creator_shortvideo_error_message, normalize_goods_card_error_message,
    normalize_goods_error_message, normalize_overview_details_error_message,
    normalize_overview_error_message,
};

#[test]
fn normalizes_common_database_connectivity_errors() {
    assert_eq!(
        normalize_goods_error_message("could not connect to server"),
        "数据库连接失败：当前服务无法连接 PostgreSQL，请检查 PGHOST/PGPORT/PGDATABASE 配置。"
    );
}

#[test]
fn normalizes_domain_specific_missing_relation_errors() {
    assert_eq!(
        normalize_goods_card_error_message(
            "ERROR: relation \"ods.douyin_trade_sale_card_raw\" does not exist"
        ),
        "商品卡 ODS 主表不存在：请先确认 ods.douyin_trade_sale_card_raw 已完成同步。"
    );
}

#[test]
fn normalizes_creator_shortvideo_missing_taxonomy_column_errors() {
    assert_eq!(
        normalize_creator_shortvideo_error_message(
            "ERROR: column d.asset_product_names does not exist"
        ),
        "短视频达人看板字段缺失：请先执行 20260609_1800、20260609_1900、20260609_2130 等短视频明细字段迁移。"
    );
}

#[test]
fn normalizes_overview_database_missing_before_fallback() {
    assert_eq!(
        normalize_overview_error_message("FATAL: database \"warehouse\" does not exist"),
        "数据库不存在：请检查 PGDATABASE 是否指向业务库。"
    );
}

#[test]
fn keeps_overview_and_details_fallbacks_distinct() {
    assert_eq!(
        normalize_overview_details_error_message("unexpected error"),
        "看板明细查询失败：请稍后重试，若持续失败请联系管理员。"
    );
}
