pub(super) fn round_to_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub(super) fn percentile(values: &[f64], ratio: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    if values.len() == 1 {
        return values[0];
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));

    let safe_ratio = ratio.clamp(0.0, 1.0);
    let position = (sorted.len() - 1) as f64 * safe_ratio;
    let lower_index = position.floor() as usize;
    let upper_index = position.ceil() as usize;
    if lower_index == upper_index {
        return sorted[lower_index];
    }

    let blend = position - lower_index as f64;
    sorted[lower_index] * (1.0 - blend) + sorted[upper_index] * blend
}

pub(super) fn normalize_with_winsorized_min_max(values: &[f64], is_cost: bool) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }

    let lower_bound = percentile(values, 0.05);
    let upper_bound = percentile(values, 0.95);
    let winsorized = values
        .iter()
        .map(|value| value.clamp(lower_bound, upper_bound))
        .collect::<Vec<_>>();
    let min_value = winsorized
        .iter()
        .copied()
        .fold(f64::INFINITY, |acc, value| acc.min(value));
    let max_value = winsorized
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, |acc, value| acc.max(value));
    let span = max_value - min_value;

    if span <= f64::EPSILON {
        return winsorized.iter().map(|_| 0.5).collect();
    }

    if is_cost {
        winsorized
            .iter()
            .map(|value| (max_value - value) / span)
            .collect()
    } else {
        winsorized
            .iter()
            .map(|value| (value - min_value) / span)
            .collect()
    }
}
