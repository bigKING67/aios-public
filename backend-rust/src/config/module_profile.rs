//! `AIOS_MODULE_PROFILE`: which business modules this deployment serves.
//!
//! `full` (default) keeps every module. `ai_studio` serves only AI 创作中心 and the
//! account surfaces it needs, for a database that holds no groland warehouse data
//! (see `.trellis/tasks/10-22-bql-ai-studio-db-rebuild/design.md`, D4).

use anyhow::bail;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ModuleProfile {
    Full,
    AiStudio,
}

impl ModuleProfile {
    pub(crate) fn parse(raw: Option<&str>) -> anyhow::Result<Self> {
        match raw.map(str::trim).filter(|value| !value.is_empty()) {
            None | Some("full") => Ok(Self::Full),
            Some("ai_studio") => Ok(Self::AiStudio),
            Some(other) => bail!("AIOS_MODULE_PROFILE must be full or ai_studio; got {other}"),
        }
    }

    pub(crate) fn from_env() -> anyhow::Result<Self> {
        Self::parse(std::env::var("AIOS_MODULE_PROFILE").ok().as_deref())
    }

    /// The process profile, read once. Startup already rejected an invalid value,
    /// so a parse failure here can only mean the variable changed afterwards.
    pub(crate) fn current() -> Self {
        static PROFILE: std::sync::OnceLock<ModuleProfile> = std::sync::OnceLock::new();
        *PROFILE.get_or_init(|| Self::from_env().unwrap_or(Self::Full))
    }

    /// Dashboards, reports, DataOps, live centre, creator library, industry news,
    /// sample inventory, recruiting review and audit logs: all read groland-only tables.
    /// Public candidate intake is independent and mounted in both profiles.
    pub(crate) fn serves_groland_modules(self) -> bool {
        self == Self::Full
    }
}

#[cfg(test)]
mod tests {
    use super::ModuleProfile;

    #[test]
    fn unset_or_full_keeps_every_module() {
        for raw in [None, Some(""), Some("  "), Some("full")] {
            let profile = ModuleProfile::parse(raw).expect("valid profile");
            assert_eq!(profile, ModuleProfile::Full);
            assert!(profile.serves_groland_modules());
        }
    }

    #[test]
    fn ai_studio_drops_groland_modules() {
        let profile = ModuleProfile::parse(Some("ai_studio")).expect("valid profile");
        assert_eq!(profile, ModuleProfile::AiStudio);
        assert!(!profile.serves_groland_modules());
    }

    #[test]
    fn unknown_profile_fails_startup() {
        let error = ModuleProfile::parse(Some("bql")).expect_err("unknown profile");
        assert!(error.to_string().contains("full or ai_studio"));
    }
}
