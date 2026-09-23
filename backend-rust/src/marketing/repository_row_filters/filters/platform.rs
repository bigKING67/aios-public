use sqlx::{Postgres, QueryBuilder};

pub(super) fn push_platform_filter(builder: &mut QueryBuilder<Postgres>, value: &str) {
    if matches_unconfirmed_platform(value) {
        builder.push(" AND (NULLIF(BTRIM(COALESCE(platform, '')), '') IS NULL OR platform IN (");
        builder.push_bind("未分类");
        builder.push(", ");
        builder.push_bind("未确认");
        builder.push(", ");
        builder.push_bind("未知");
        builder.push("))");
        return;
    }

    builder.push(" AND platform = ");
    builder.push_bind(value.to_string());
}

fn matches_unconfirmed_platform(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "" | "unknown" | "unclassified" | "未分类" | "未确认" | "未知"
    )
}
