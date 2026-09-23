use std::collections::{HashMap, HashSet};

use serde_json::Value;

use super::super::super::DOUYIN_CARD_SOURCE_CHANNELS;

pub(super) fn resolve_source_channels(
    current_source_map: &HashMap<String, Value>,
    prev_source_map: &HashMap<String, Value>,
) -> Vec<String> {
    let mut source_channels: Vec<String> = DOUYIN_CARD_SOURCE_CHANNELS
        .iter()
        .map(|value| value.to_string())
        .collect();
    let mut seen_channels: HashSet<String> = source_channels.iter().cloned().collect();
    for channel in current_source_map.keys().chain(prev_source_map.keys()) {
        if !seen_channels.contains(channel) {
            source_channels.push(channel.clone());
            seen_channels.insert(channel.clone());
        }
    }
    source_channels
}
