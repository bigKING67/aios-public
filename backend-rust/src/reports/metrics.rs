pub(super) fn safe_ratio(numerator: f64, denominator: f64) -> Option<f64> {
    if !numerator.is_finite() || !denominator.is_finite() {
        return None;
    }

    if denominator.abs() < f64::EPSILON {
        return None;
    }

    Some(numerator / denominator)
}

pub(super) fn calculate_wow(current: f64, previous: f64) -> Option<f64> {
    if previous.abs() < f64::EPSILON {
        return None;
    }
    Some((current / previous - 1.0) * 100.0)
}

pub(super) fn format_currency(value: f64) -> String {
    if value >= 10_000.0 {
        format!("¥{:.2}万", value / 10_000.0)
    } else if value >= 1_000.0 {
        format!("¥{:.2}千", value / 1_000.0)
    } else {
        format!("¥{value:.2}")
    }
}

pub(super) fn format_number(value: f64) -> String {
    if value >= 10_000.0 {
        format!("{:.2}万", value / 10_000.0)
    } else if value >= 1_000.0 {
        format!("{:.2}K", value / 1_000.0)
    } else {
        format!("{value:.0}")
    }
}
