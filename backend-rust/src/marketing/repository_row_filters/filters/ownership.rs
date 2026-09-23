use sqlx::{Postgres, QueryBuilder};

pub(super) fn push_ownership_filter(
    builder: &mut QueryBuilder<Postgres>,
    value: &str,
    actor_user_id: Option<&str>,
) {
    match value {
        "public_seed" => {
            builder.push(" AND owner_user_id IS NULL AND created_by_user_id IS NULL");
        }
        "mine" => {
            builder.push(" AND (owner_user_id = ");
            builder.push_bind(actor_user_id.unwrap_or_default().to_string());
            builder.push(" OR created_by_user_id = ");
            builder.push_bind(actor_user_id.unwrap_or_default().to_string());
            builder.push(")");
        }
        "others" => {
            builder.push(" AND (COALESCE(owner_user_id, '') <> ");
            builder.push_bind(actor_user_id.unwrap_or_default().to_string());
            builder.push(" AND COALESCE(created_by_user_id, '') <> ");
            builder.push_bind(actor_user_id.unwrap_or_default().to_string());
            builder.push(")");
        }
        _ => {
            builder.push("");
        }
    };
}

pub(super) fn push_mcn_status_filter(builder: &mut QueryBuilder<Postgres>, value: &str) {
    match value {
        "registered" => builder.push(" AND NULLIF(BTRIM(COALESCE(mcn, '')), '') IS NOT NULL"),
        "missing" => builder.push(" AND NULLIF(BTRIM(COALESCE(mcn, '')), '') IS NULL"),
        _ => builder.push(""),
    };
}
