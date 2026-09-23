use sqlx::{Postgres, QueryBuilder};

use super::super::{
    repository_sql::NORMALIZED_ANCHOR_LEVEL_SQL,
    types::{NormalizedQuery, NOT_COOPERABLE_STATUS_VALUE},
};
use super::constants::LEGACY_NOT_COOPERABLE_STATUS_VALUE;

mod anchor_tags;
mod ownership;
mod platform;
mod ranges;

pub(in crate::marketing) fn push_filters(
    builder: &mut QueryBuilder<Postgres>,
    query: &NormalizedQuery,
    actor_user_id: Option<&str>,
) {
    if let Some(value) = &query.keyword {
        let pattern = format!("%{}%", value);
        builder.push(" AND (influencer_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR influencer_id ILIKE ");
        builder.push_bind(pattern);
        builder.push(")");
    }
    if let Some(value) = &query.platform {
        platform::push_platform_filter(builder, value);
    }
    if let Some(value) = &query.category {
        builder.push(" AND category = ");
        builder.push_bind(value.clone());
    }
    if !query.anchor_tags.is_empty() {
        anchor_tags::push_anchor_tags_filter(builder, query.anchor_tags.as_slice());
    }
    if let Some(value) = &query.anchor_level {
        builder.push(" AND ");
        builder.push(NORMALIZED_ANCHOR_LEVEL_SQL);
        builder.push(" = ");
        builder.push_bind(value.clone());
    }
    if let Some(value) = &query.cooperation_status {
        if value == NOT_COOPERABLE_STATUS_VALUE || value == LEGACY_NOT_COOPERABLE_STATUS_VALUE {
            builder.push(" AND is_cooperable = FALSE");
        } else {
            builder.push(" AND cooperation_status_norm = ");
            builder.push_bind(value.clone());
        }
    }
    if let Some(value) = &query.owner_name {
        builder.push(" AND owner_name = ");
        builder.push_bind(value.clone());
    }
    if let Some(value) = &query.owner_user_id {
        builder.push(" AND owner_user_id = ");
        builder.push_bind(value.clone());
    }
    if let Some(value) = &query.is_cooperable {
        builder.push(" AND is_cooperable = ");
        builder.push_bind(*value);
    }
    if let Some(value) = &query.fans_band {
        ranges::push_fans_band_filter(builder, value);
    }
    if let Some(value) = &query.last_follow_range {
        ranges::push_last_follow_filter(builder, value);
    }
    if let Some(value) = &query.source_type {
        builder.push(" AND source_type = ");
        builder.push_bind(value.clone());
    }
    if let Some(value) = &query.ownership {
        ownership::push_ownership_filter(builder, value, actor_user_id);
    }
    if let Some(value) = &query.mcn_status {
        ownership::push_mcn_status_filter(builder, value);
    }
}
