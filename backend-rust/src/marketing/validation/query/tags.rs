use crate::{
    error::{AppError, AppResult},
    marketing::{
        anchor_tags::{dedup_anchor_tags, normalize_anchor_tag_text},
        types::TEXT_MAX_LEN,
    },
};

pub(super) fn normalize_anchor_tags(
    anchor_tag: Option<String>,
    anchor_tags: Option<String>,
) -> AppResult<Vec<String>> {
    let mut values = Vec::new();
    if let Some(value) = anchor_tag.and_then(normalize_anchor_tag_text) {
        validate_anchor_tag_len(value.as_str())?;
        values.push(value);
    }
    if let Some(value) = anchor_tags {
        for item in value.split([',', '，', '、', ';', '；', '/']) {
            if let Some(normalized) = normalize_anchor_tag_text(item.to_string()) {
                validate_anchor_tag_len(normalized.as_str())?;
                values.push(normalized);
            }
        }
    }

    values.sort();
    Ok(dedup_anchor_tags(values, 20))
}

fn validate_anchor_tag_len(value: &str) -> AppResult<()> {
    if value.chars().count() > TEXT_MAX_LEN {
        return Err(AppError::bad_request(format!(
            "主播标签不能超过 {} 个字符",
            TEXT_MAX_LEN
        )));
    }

    Ok(())
}
