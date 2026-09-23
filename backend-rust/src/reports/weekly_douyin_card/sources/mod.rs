use serde_json::Value;
use sqlx::postgres::PgRow;

use self::{
    channels::resolve_source_channels,
    item::build_source_item,
    row_maps::{build_current_source_map, build_previous_source_map},
};

mod channels;
mod item;
mod row_maps;

pub(super) fn build_source_items(
    current_source_rows: Vec<PgRow>,
    prev_source_rows: Vec<PgRow>,
) -> Vec<Value> {
    let current_source_map = build_current_source_map(current_source_rows);
    let prev_source_map = build_previous_source_map(prev_source_rows);
    let source_channels = resolve_source_channels(&current_source_map, &prev_source_map);

    let mut source_items_with_score = source_channels
        .into_iter()
        .map(|source_level1| {
            let current_item = current_source_map.get(&source_level1);
            let prev_item = prev_source_map.get(&source_level1);
            build_source_item(source_level1, current_item, prev_item)
        })
        .collect::<Vec<_>>();

    source_items_with_score.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    source_items_with_score
        .into_iter()
        .map(|(_, item)| item)
        .collect()
}
