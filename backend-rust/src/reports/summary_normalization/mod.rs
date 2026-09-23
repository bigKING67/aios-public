mod facts;
mod keys;
mod numeric;
mod text_context;
mod text_numbers;
mod text_percentages;

pub(super) use facts::normalize_summary_facts_percentages;
pub(super) use text_numbers::normalize_summary_text_numbers;
pub(super) use text_percentages::normalize_summary_text_percentages;

#[cfg(test)]
pub(super) fn is_two_decimal_rate_key(key: &str) -> bool {
    keys::is_two_decimal_rate_key(key)
}

#[cfg(test)]
pub(super) fn is_integer_percent_key(key: &str) -> bool {
    keys::is_integer_percent_key(key)
}

#[cfg(test)]
pub(super) fn is_integer_display_metric_key(key: &str) -> bool {
    keys::is_integer_display_metric_key(key)
}
