//! Generated package identity is embedded in the API binary, never chosen by a client.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RenderBinding {
    pub contract_version: u32,
    pub renderer_lock_sha256: String,
    pub engine: String,
    pub engine_version: String,
    pub caption_font: FontBinding,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct FontBinding {
    pub profile: String,
    pub sha256: String,
}

pub(super) fn current() -> RenderBinding {
    serde_json::from_str(include_str!("render-binding.json"))
        .expect("checked embedded render binding")
}

pub(super) fn receipt_matches(binding: Option<&RenderBinding>, receipt: &Value) -> bool {
    binding.is_none_or(|expected| {
        receipt
            .get("render_binding")
            .and_then(|value| serde_json::from_value::<RenderBinding>(value.clone()).ok())
            .as_ref()
            == Some(expected)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn embedded_binding_matches_worker_lock_and_font_manifest() {
        let raw = include_bytes!("../../../../../etl/groland_postgres/scripts/content_production/creative-craft.lock.json");
        let lock: Value = serde_json::from_slice(raw).unwrap();
        let binding = current();
        assert_eq!(binding.contract_version, 1);
        assert_eq!(
            binding.renderer_lock_sha256,
            hex::encode(Sha256::digest(raw))
        );
        assert_eq!(binding.engine, lock["engine"]);
        assert_eq!(binding.engine_version, lock["engine_version"]);
        assert_eq!(
            binding.caption_font.sha256,
            lock["files"]["fonts/NotoSansSC.ttf"]
        );
        let font: Value = serde_json::from_str(include_str!(
            "../../../../../docker/content-production/renderer/fonts/manifest.json"
        ))
        .unwrap();
        assert_eq!(binding.caption_font.profile, font["profile"]);
        assert_eq!(binding.caption_font.sha256, font["sha256"]);
    }

    #[test]
    fn receipt_matches_frozen_package_not_todays_package() {
        let mut old = current();
        old.renderer_lock_sha256 = "a".repeat(64);
        let receipt = serde_json::json!({"render_binding": old});
        assert!(receipt_matches(Some(&old), &receipt));
        assert!(!receipt_matches(Some(&current()), &receipt));
        assert!(!receipt_matches(Some(&current()), &serde_json::json!({})));
        assert!(receipt_matches(None, &serde_json::json!({})));
    }
}
