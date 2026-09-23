use sqlx::{Postgres, QueryBuilder};

pub(crate) fn push_creator_select_columns(
    builder: &mut QueryBuilder<Postgres>,
    actor_user_id: &str,
    can_manage: bool,
) {
    builder.push(CREATOR_SELECT_COLUMNS_BEFORE_BIND);
    builder.push_bind(can_manage);
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_CAN_MANAGE_BIND);
    builder.push_bind(actor_user_id.to_string());
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_OWNER_BIND);
    builder.push_bind(actor_user_id.to_string());
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_CREATED_BY_BIND);
    builder.push_bind(can_manage);
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_DELETE_MANAGE_BIND);
    builder.push_bind(actor_user_id.to_string());
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_DELETE_OWNER_BIND);
    builder.push_bind(actor_user_id.to_string());
    builder.push(CREATOR_SELECT_COLUMNS_AFTER_DELETE_CREATED_BY_BIND);
}

pub(super) fn creator_select_columns_static(
    actor_placeholder: &str,
    can_manage_placeholder: &str,
) -> String {
    format!(
        "{}{}{}{}{}{}{}{}{}{}{}{}{}",
        CREATOR_SELECT_COLUMNS_BEFORE_BIND,
        can_manage_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_CAN_MANAGE_BIND,
        actor_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_OWNER_BIND,
        actor_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_CREATED_BY_BIND,
        can_manage_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_DELETE_MANAGE_BIND,
        actor_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_DELETE_OWNER_BIND,
        actor_placeholder,
        CREATOR_SELECT_COLUMNS_AFTER_DELETE_CREATED_BY_BIND
    )
}

const CREATOR_SELECT_COLUMNS_BEFORE_BIND: &str = r#"
          id,
          platform,
          influencer_name,
          influencer_id,
          douyin_handle,
          phone,
          mcn,
          category,
          anchor_desc,
          anchor_level,
          main_platform_fans,
          main_platform_fans_count::DOUBLE PRECISION AS main_platform_fans_count,
          sales_30d,
          sales_30d_amount::DOUBLE PRECISION AS sales_30d_amount,
          sales_90d,
          sales_90d_amount::DOUBLE PRECISION AS sales_90d_amount,
          tags,
          cooperation_status,
          cooperation_status_norm,
          cooperation_desc,
          owner_name,
          owner_user_id,
          is_cooperable,
          last_followed_at::TEXT AS last_followed_at,
          follow_note,
          COALESCE((
            SELECT COUNT(*)::BIGINT
            FROM ads.influencer_library_follow_log AS follow_log
            WHERE follow_log.influencer_library_id = ads.influencer_library.id
              AND follow_log.is_deleted = FALSE
          ), 0)::BIGINT AS follow_log_count,
          source_type,
          source_file_name,
          created_by,
          updated_by,
          CASE
            WHEN owner_user_id IS NOT NULL THEN 'bd_owned'
            WHEN created_by_user_id IS NULL THEN 'public_seed'
            ELSE 'owned'
          END AS ownership_type,
          CASE
            WHEN "#;

const CREATOR_SELECT_COLUMNS_AFTER_CAN_MANAGE_BIND: &str = r#" THEN TRUE
            WHEN owner_user_id = "#;

const CREATOR_SELECT_COLUMNS_AFTER_OWNER_BIND: &str = r#" THEN TRUE
            WHEN created_by_user_id = "#;

const CREATOR_SELECT_COLUMNS_AFTER_CREATED_BY_BIND: &str = r#" THEN TRUE
            ELSE FALSE
          END AS can_edit,
          CASE
            WHEN "#;

const CREATOR_SELECT_COLUMNS_AFTER_DELETE_MANAGE_BIND: &str = r#" THEN TRUE
            WHEN owner_user_id = "#;

const CREATOR_SELECT_COLUMNS_AFTER_DELETE_OWNER_BIND: &str = r#" THEN TRUE
            WHEN created_by_user_id = "#;

const CREATOR_SELECT_COLUMNS_AFTER_DELETE_CREATED_BY_BIND: &str = r#" THEN TRUE
            ELSE FALSE
          END AS can_delete,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
"#;
