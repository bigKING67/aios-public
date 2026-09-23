use sqlx::Row;

use super::super::{types::CreatorLibraryItem, validation::normalize_anchor_level_label};

pub(in crate::marketing) fn item_from_row(row: &sqlx::postgres::PgRow) -> CreatorLibraryItem {
    CreatorLibraryItem {
        id: row.try_get("id").unwrap_or(0),
        platform: row.try_get("platform").unwrap_or_default(),
        influencer_name: row.try_get("influencer_name").unwrap_or_default(),
        influencer_id: row.try_get("influencer_id").ok().flatten(),
        douyin_handle: row.try_get("douyin_handle").ok().flatten(),
        phone: row.try_get("phone").ok().flatten(),
        mcn: row.try_get("mcn").ok().flatten(),
        category: row.try_get("category").ok().flatten(),
        anchor_desc: row.try_get("anchor_desc").ok().flatten(),
        anchor_level: normalize_anchor_level_for_display(
            row.try_get("anchor_level").ok().flatten(),
        ),
        main_platform_fans: row.try_get("main_platform_fans").ok().flatten(),
        main_platform_fans_count: row.try_get("main_platform_fans_count").ok().flatten(),
        sales_30d: row.try_get("sales_30d").ok().flatten(),
        sales_30d_amount: row.try_get("sales_30d_amount").ok().flatten(),
        sales_90d: row.try_get("sales_90d").ok().flatten(),
        sales_90d_amount: row.try_get("sales_90d_amount").ok().flatten(),
        tags: row.try_get("tags").unwrap_or_default(),
        cooperation_status: row.try_get("cooperation_status").ok().flatten(),
        cooperation_status_norm: row.try_get("cooperation_status_norm").unwrap_or_default(),
        cooperation_desc: row.try_get("cooperation_desc").ok().flatten(),
        owner_name: row.try_get("owner_name").ok().flatten(),
        owner_user_id: row.try_get("owner_user_id").ok().flatten(),
        is_cooperable: row.try_get("is_cooperable").unwrap_or(false),
        last_followed_at: row.try_get("last_followed_at").ok().flatten(),
        follow_note: row.try_get("follow_note").ok().flatten(),
        follow_log_count: row.try_get("follow_log_count").unwrap_or(0),
        source_type: row.try_get("source_type").unwrap_or_default(),
        source_file_name: row.try_get("source_file_name").ok().flatten(),
        created_by: row.try_get("created_by").ok().flatten(),
        updated_by: row.try_get("updated_by").ok().flatten(),
        ownership_type: row
            .try_get("ownership_type")
            .unwrap_or_else(|_| "owned".to_string()),
        can_edit: row.try_get("can_edit").unwrap_or(false),
        can_delete: row.try_get("can_delete").unwrap_or(false),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

fn normalize_anchor_level_for_display(value: Option<String>) -> Option<String> {
    let value = value
        .map(|raw| raw.trim().replace('\u{feff}', ""))
        .filter(|raw| !raw.is_empty())?;
    Some(
        normalize_anchor_level_label(value.as_str())
            .unwrap_or_else(|| value.replace('（', "(").replace('）', ")")),
    )
}
