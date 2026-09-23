use super::columns::creator_select_columns_static;

pub(crate) fn insert_creator_sql() -> String {
    format!(
        r#"
        INSERT INTO ads.influencer_library (
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
          main_platform_fans_count,
          sales_30d,
          sales_30d_amount,
          sales_90d,
          sales_90d_amount,
          tags,
          cooperation_status,
          cooperation_status_norm,
          cooperation_desc,
          owner_name,
          owner_user_id,
          is_cooperable,
          last_followed_at,
          follow_note,
          source_type,
          created_by,
          updated_by,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          ads.fn_influencer_library_parse_number($10),
          $11,
          ads.fn_influencer_library_parse_number($11),
          $12,
          ads.fn_influencer_library_parse_number($12),
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $23,
          $24,
          $24
        )
        ON CONFLICT (library_dedupe_key) WHERE is_deleted = FALSE
        DO NOTHING
        RETURNING
        {}
        "#,
        creator_select_columns_static("$24", "$25")
    )
}

pub(crate) fn update_creator_sql() -> String {
    format!(
        r#"
        UPDATE ads.influencer_library
        SET
          platform = $2,
          influencer_name = $3,
          influencer_id = $4,
          douyin_handle = $5,
          phone = $6,
          mcn = $7,
          category = $8,
          anchor_desc = $9,
          anchor_level = $10,
          main_platform_fans = $11,
          main_platform_fans_count = ads.fn_influencer_library_parse_number($11),
          sales_30d = $12,
          sales_30d_amount = ads.fn_influencer_library_parse_number($12),
          sales_90d = $13,
          sales_90d_amount = ads.fn_influencer_library_parse_number($13),
          tags = $14,
          cooperation_status = $15,
          cooperation_status_norm = $16,
          cooperation_desc = $17,
          owner_name = $18,
          owner_user_id = $19,
          is_cooperable = $20,
          last_followed_at = last_followed_at,
          follow_note = follow_note,
          updated_by = $21,
          updated_by_user_id = $22
        WHERE id = $1
          AND is_deleted = FALSE
          AND (
            $24
            OR owner_user_id = $22
            OR created_by_user_id = $22
          )
          AND updated_at::TEXT = $23::TEXT
        RETURNING
        {}
        "#,
        creator_select_columns_static("$22", "$24")
    )
}
