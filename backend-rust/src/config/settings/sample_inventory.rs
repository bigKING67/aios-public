use std::fmt;

use super::super::env::env_var_or;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleInventoryAccessMode {
    Public,
    Authenticated,
}

impl SampleInventoryAccessMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Authenticated => "authenticated",
        }
    }

    fn parse(raw: &str) -> anyhow::Result<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "public" => Ok(Self::Public),
            "authenticated" => Ok(Self::Authenticated),
            value => anyhow::bail!(
                "invalid SAMPLE_INVENTORY_ACCESS_MODE: {value}; expected public or authenticated"
            ),
        }
    }
}

impl fmt::Display for SampleInventoryAccessMode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

pub(super) fn resolve_sample_inventory_access_mode() -> anyhow::Result<SampleInventoryAccessMode> {
    SampleInventoryAccessMode::parse(
        env_var_or("SAMPLE_INVENTORY_ACCESS_MODE", "authenticated").as_str(),
    )
}

#[cfg(test)]
mod tests {
    use super::SampleInventoryAccessMode;

    #[test]
    fn access_mode_parser_is_fail_closed() {
        assert_eq!(
            SampleInventoryAccessMode::parse("public").expect("public should parse"),
            SampleInventoryAccessMode::Public
        );
        assert_eq!(
            SampleInventoryAccessMode::parse(" AUTHENTICATED ")
                .expect("authenticated should parse"),
            SampleInventoryAccessMode::Authenticated
        );
        assert!(SampleInventoryAccessMode::parse("anonymous").is_err());
    }
}
