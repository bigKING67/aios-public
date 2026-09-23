use super::columns::creator_select_columns_static;

pub(crate) fn select_creator_by_id_sql() -> String {
    format!(
        r#"
        SELECT
        {}
        FROM ads.influencer_library
        WHERE id = $1
          AND is_deleted = FALSE
        "#,
        creator_select_columns_static("$2", "$3")
    )
}
