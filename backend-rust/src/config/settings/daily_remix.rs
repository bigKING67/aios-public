//! Default-off daily dispatch. Empty budget deliberately means no money cap.
#[derive(Debug, Clone)]
pub struct DailyRemixSettings {
    pub enabled: bool,
    pub service_token: Option<String>,
    pub budget_micros: Option<i64>,
}

impl DailyRemixSettings {
    pub(super) fn from_env() -> Self {
        Self {
            enabled: std::env::var("CONTENT_AI_STUDIO_DAILY_REMIX_ENABLED").as_deref()
                == Ok("true"),
            service_token: std::env::var("CONTENT_AI_STUDIO_DAILY_REMIX_TOKEN")
                .ok()
                .filter(|s| s.len() >= 32),
            budget_micros: budget(
                std::env::var("CONTENT_AI_STUDIO_DAILY_REMIX_BUDGET_YUAN")
                    .ok()
                    .as_deref(),
            ),
        }
    }
}

fn budget(raw: Option<&str>) -> Option<i64> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    // Invalid configured values fail closed at dispatch, never become unlimited.
    Some(
        raw.parse::<f64>()
            .ok()
            .filter(|n| n.is_finite() && *n > 0.0 && *n <= 1_000_000.0)
            .map(|n| (n * 1_000_000.0).floor() as i64)
            .unwrap_or(0),
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn unset_budget_is_unlimited_and_invalid_budget_stops_dispatch() {
        assert_eq!(super::budget(None), None);
        assert_eq!(super::budget(Some(" ")), None);
        assert_eq!(super::budget(Some("2.13")), Some(2_130_000));
        for value in ["NaN", "inf", "-1", "bad", "0", "1000001"] {
            assert_eq!(super::budget(Some(value)), Some(0));
        }
    }
}
