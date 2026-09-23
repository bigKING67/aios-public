use sqlx::{PgPool, Row};

pub(super) async fn fetch_owner_aliases(pool: &PgPool) -> anyhow::Result<Vec<String>> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT NULLIF(BTRIM(owner_name), '') AS owner_name
        FROM ads.influencer_library
        WHERE COALESCE(is_deleted, FALSE) = FALSE
          AND NULLIF(BTRIM(owner_name), '') IS NOT NULL
        ORDER BY owner_name
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            row.try_get::<Option<String>, _>("owner_name")
                .ok()
                .flatten()
        })
        .collect())
}
