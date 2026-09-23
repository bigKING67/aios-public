use sqlx::{Postgres, QueryBuilder};

pub(super) fn push_fans_band_filter(builder: &mut QueryBuilder<Postgres>, value: &str) {
    match value {
        "lt_10w" => builder.push(" AND main_platform_fans_count < 100000"),
        "10w_50w" => builder
            .push(" AND main_platform_fans_count >= 100000 AND main_platform_fans_count < 500000"),
        "50w_100w" => builder
            .push(" AND main_platform_fans_count >= 500000 AND main_platform_fans_count < 1000000"),
        "100w_500w" => builder.push(
            " AND main_platform_fans_count >= 1000000 AND main_platform_fans_count < 5000000",
        ),
        "gte_500w" => builder.push(" AND main_platform_fans_count >= 5000000"),
        _ => builder.push(""),
    };
}

pub(super) fn push_last_follow_filter(builder: &mut QueryBuilder<Postgres>, value: &str) {
    match value {
        "none" => builder.push(" AND last_followed_at IS NULL"),
        "over_30d" => builder.push(
            " AND (last_followed_at IS NULL OR last_followed_at < CURRENT_DATE - INTERVAL '30 days')",
        ),
        "over_14d" => builder.push(
            " AND (last_followed_at IS NULL OR last_followed_at < CURRENT_DATE - INTERVAL '14 days')",
        ),
        "within_7d" => builder.push(" AND last_followed_at >= CURRENT_DATE - INTERVAL '7 days'"),
        _ => builder.push(""),
    };
}
