use super::super::{DEFAULT_TOP_N, MAX_TOP_N, MIN_TOP_N};

pub(in crate::dashboard) fn parse_top_n(raw: Option<&str>) -> usize {
    let parsed = raw
        .unwrap_or_default()
        .trim()
        .parse::<usize>()
        .ok()
        .unwrap_or(DEFAULT_TOP_N);
    parsed.clamp(MIN_TOP_N, MAX_TOP_N)
}
