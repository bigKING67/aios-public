use once_cell::sync::Lazy;
use regex::Regex;

use super::{super::Conclusions, sanitize::sanitize_summary_conclusions};

mod fence;
mod json;
mod plain_text;

pub(in crate::reports) use json::parse_summary_conclusions;

static JSON_OBJECT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\{[\s\S]*\}").expect("valid json regex"));

pub(in crate::reports) fn parse_conclusions_from_llm(
    raw_output: &str,
) -> anyhow::Result<Conclusions> {
    let stripped = fence::strip_code_fence(raw_output.trim());
    let json_text = extract_json_object(stripped.as_str()).unwrap_or(stripped);

    match parse_summary_conclusions(json_text.as_str()) {
        Ok(conclusions) => Ok(sanitize_summary_conclusions(conclusions)),
        Err(primary_error) => {
            if let Ok(fallback) = plain_text::parse_conclusions_from_plain_text(json_text.as_str())
            {
                return Ok(sanitize_summary_conclusions(fallback));
            }
            Err(primary_error)
        }
    }
}

fn extract_json_object(stripped: &str) -> Option<String> {
    JSON_OBJECT_RE
        .find(stripped)
        .map(|matched| matched.as_str().to_string())
}
