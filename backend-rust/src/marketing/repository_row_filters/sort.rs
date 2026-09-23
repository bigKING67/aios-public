use sqlx::{Postgres, QueryBuilder};

use super::super::types::CreatorLibrarySort;
use super::constants::{ANCHOR_LEVEL_SORT_ASC_SQL, ANCHOR_LEVEL_SORT_DESC_SQL};

pub(in crate::marketing) fn push_sort_clause(
    builder: &mut QueryBuilder<Postgres>,
    sort: CreatorLibrarySort,
    actor_user_id: &str,
) {
    if matches!(sort, CreatorLibrarySort::OwnerPriorityDesc) {
        push_owner_priority_sort_clause(builder, actor_user_id);
        return;
    }

    builder.push(static_sort_clause(sort));
}

fn push_owner_priority_sort_clause(builder: &mut QueryBuilder<Postgres>, actor_user_id: &str) {
    builder.push("CASE WHEN owner_user_id = ");
    builder.push_bind(actor_user_id.to_string());
    builder.push(" THEN 0 WHEN NULLIF(owner_user_id, '') IS NULL AND created_by_user_id = ");
    builder.push_bind(actor_user_id.to_string());
    builder.push(
        " THEN 1 WHEN NULLIF(owner_user_id, '') IS NULL AND NULLIF(created_by_user_id, '') IS NULL THEN 2 ELSE 3 END ASC, updated_at DESC, id DESC",
    );
}

fn static_sort_clause(sort: CreatorLibrarySort) -> &'static str {
    match sort {
        CreatorLibrarySort::OwnerPriorityDesc => unreachable!("owner priority sort needs actor bind"),
        CreatorLibrarySort::UpdatedDesc => "updated_at DESC, id DESC",
        CreatorLibrarySort::UpdatedAsc => "updated_at ASC, id ASC",
        CreatorLibrarySort::IdentityAsc => {
            "LOWER(COALESCE(NULLIF(influencer_id, ''), NULLIF(douyin_handle, ''), influencer_name, '')) ASC, id DESC"
        }
        CreatorLibrarySort::IdentityDesc => {
            "LOWER(COALESCE(NULLIF(influencer_id, ''), NULLIF(douyin_handle, ''), influencer_name, '')) DESC, id DESC"
        }
        CreatorLibrarySort::NameAsc => "LOWER(influencer_name) ASC, id DESC",
        CreatorLibrarySort::NameDesc => "LOWER(influencer_name) DESC, id DESC",
        CreatorLibrarySort::PlatformAsc => "LOWER(platform) ASC, id DESC",
        CreatorLibrarySort::PlatformDesc => "LOWER(platform) DESC, id DESC",
        CreatorLibrarySort::FansDesc => "main_platform_fans_count DESC NULLS LAST, id DESC",
        CreatorLibrarySort::FansAsc => "main_platform_fans_count ASC NULLS LAST, id DESC",
        CreatorLibrarySort::AnchorTagAsc => {
            "LOWER(COALESCE(NULLIF(tags[1], ''), NULLIF(anchor_desc, ''), '')) ASC, id DESC"
        }
        CreatorLibrarySort::AnchorTagDesc => {
            "LOWER(COALESCE(NULLIF(tags[1], ''), NULLIF(anchor_desc, ''), '')) DESC, id DESC"
        }
        CreatorLibrarySort::AnchorLevelAsc => ANCHOR_LEVEL_SORT_ASC_SQL,
        CreatorLibrarySort::AnchorLevelDesc => ANCHOR_LEVEL_SORT_DESC_SQL,
        CreatorLibrarySort::Sales30dDesc => "sales_30d_amount DESC NULLS LAST, id DESC",
        CreatorLibrarySort::Sales30dAsc => "sales_30d_amount ASC NULLS LAST, id DESC",
        CreatorLibrarySort::Sales90dDesc => "sales_90d_amount DESC NULLS LAST, id DESC",
        CreatorLibrarySort::Sales90dAsc => "sales_90d_amount ASC NULLS LAST, id DESC",
        CreatorLibrarySort::StatusAsc => "LOWER(COALESCE(cooperation_status_norm, '')) ASC, id DESC",
        CreatorLibrarySort::StatusDesc => {
            "LOWER(COALESCE(cooperation_status_norm, '')) DESC, id DESC"
        }
        CreatorLibrarySort::OwnerAsc => "LOWER(COALESCE(owner_name, '')) ASC, id DESC",
        CreatorLibrarySort::OwnerDesc => "LOWER(COALESCE(owner_name, '')) DESC, id DESC",
        CreatorLibrarySort::LastFollowAsc => "last_followed_at ASC NULLS FIRST, id DESC",
        CreatorLibrarySort::LastFollowDesc => "last_followed_at DESC NULLS LAST, id DESC",
    }
}

#[cfg(test)]
mod tests {
    use sqlx::Execute;

    use super::*;

    #[test]
    fn owner_priority_sort_prioritizes_actor_before_updated_at() {
        let mut builder = QueryBuilder::<Postgres>::new("ORDER BY ");

        push_sort_clause(
            &mut builder,
            CreatorLibrarySort::OwnerPriorityDesc,
            "actor-user-id",
        );

        let query = builder.build();
        let sql = query.sql();

        assert!(sql.contains("CASE WHEN owner_user_id ="));
        assert!(sql.contains("created_by_user_id ="));
        assert!(sql.contains("THEN 0"));
        assert!(sql.contains("THEN 1"));
        assert!(sql.contains("updated_at DESC, id DESC"));
    }
}
