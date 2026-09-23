use std::sync::Arc;

use axum::{
    routing::{get, patch, post, put},
    Router,
};

use crate::state::AppState;

mod access;
mod cache;
mod creator_handlers;
mod creator_live;
mod creator_live_overview;
mod creator_shortvideo_details;
mod creator_shortvideo_overview;
mod date_bounds;
mod errors;
mod goods;
mod goods_card;
mod goods_card_handlers;
mod goods_card_traffic;
mod goods_handlers;
mod goods_score;
mod industry_material_inspiration;
mod live_details;
mod live_goods;
mod live_summary;
mod media_handlers;
mod metric_values;
mod notes;
mod overview;
mod overview_handlers;
mod overview_nowcast;
mod overview_nowcast_patch;
mod params;
mod pg_row_parse;
mod qianchuan;
mod query_runtime;
mod responses;
mod shortvideo_details;
mod shortvideo_summary;
mod sql_templates;
mod timing;
mod traffic;
mod traffic_goods;
mod traffic_handlers;
mod validation;

use creator_handlers::{
    delete_creator_shortvideo_manual_attrs, get_creator_live_date_bounds, get_creator_live_details,
    get_creator_live_overview, get_creator_shortvideo_date_bounds, get_creator_shortvideo_details,
    get_creator_shortvideo_overview, upsert_creator_shortvideo_manual_attrs,
};
use date_bounds::get_dashboard_date_bounds;
use goods_card_handlers::{get_goods_card, get_goods_card_traffic};
use goods_handlers::get_goods;
use industry_material_inspiration::{
    get_industry_material_inspiration, post_industry_material_brand_ai_analysis_backfill,
};
use media_handlers::{get_live, get_live_goods, get_live_goods_details, get_short_video};
use notes::{create_note, delete_note, list_notes, update_note};
use overview_handlers::{get_overview, get_overview_details};
use qianchuan::get_qianchuan;
use traffic_handlers::{get_traffic, get_traffic_goods};

const DEFAULT_MAX_DATE_RANGE_DAYS: i64 = 720;
const DEFAULT_CREATOR_LIVE_MAX_DATE_RANGE_DAYS: i64 = 36500;
const DEFAULT_CREATOR_SHORTVIDEO_MAX_DATE_RANGE_DAYS: i64 = 36500;
const DEFAULT_TOP_N: usize = 20;
const MAX_TOP_N: usize = 200;
const MIN_TOP_N: usize = 1;
const DEFAULT_SCORE_POOL_N: usize = 200;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/date-bounds", get(get_dashboard_date_bounds))
        .route("/overview", get(get_overview))
        .route("/live", get(get_live))
        .route("/live/goods", get(get_live_goods))
        .route("/live/goods/details", get(get_live_goods_details))
        .route("/short-video", get(get_short_video))
        .route("/goods-card", get(get_goods_card))
        .route("/goods-card/traffic", get(get_goods_card_traffic))
        .route("/qianchuan", get(get_qianchuan))
        .route(
            "/industry-material-inspiration",
            get(get_industry_material_inspiration),
        )
        .route(
            "/industry-material-inspiration/brand-ai-analysis/backfill",
            post(post_industry_material_brand_ai_analysis_backfill),
        )
        .route("/overview/details", get(get_overview_details))
        .route(
            "/creator/live/date-bounds",
            get(get_creator_live_date_bounds),
        )
        .route("/creator/live/overview", get(get_creator_live_overview))
        .route("/creator/live/details", get(get_creator_live_details))
        .route(
            "/creator/short-video/date-bounds",
            get(get_creator_shortvideo_date_bounds),
        )
        .route(
            "/creator/short-video/overview",
            get(get_creator_shortvideo_overview),
        )
        .route(
            "/creator/short-video/details",
            get(get_creator_shortvideo_details),
        )
        .route(
            "/creator/short-video/manual-attrs",
            put(upsert_creator_shortvideo_manual_attrs)
                .delete(delete_creator_shortvideo_manual_attrs),
        )
        .route("/goods", get(get_goods))
        .route("/traffic", get(get_traffic))
        .route("/traffic/goods", get(get_traffic_goods))
        .route("/notes", get(list_notes).post(create_note))
        .route("/notes/{id}", patch(update_note).delete(delete_note))
}
