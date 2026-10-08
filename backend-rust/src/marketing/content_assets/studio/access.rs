//! AI 创作中心 access mode (`CONTENT_AI_STUDIO_OPEN_ACCESS`, default on).
//! Open: any signed-in user may write studio segments, request AI 切段 and
//! create, see and cancel every remix batch; the content-asset edit permission
//! and write scope are not required inside the studio. Scoped: the previous
//! rules (write scope, per-asset edit permission, owner-only batches).
//! Either way audit columns record the real acting user, and content rights,
//! readiness and raw hash checks are unchanged. Library and single-task
//! production endpoints keep their own permissions.
use crate::{auth::CurrentUser, config::Settings};

use super::super::production::framework_remix::SourcePermission;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct StudioAccess<'a> {
    open: bool,
    /// `企业:<name>` when `CONTENT_AI_STUDIO_ENTERPRISE` is set.
    enterprise_tag: Option<&'a str>,
}

impl StudioAccess<'static> {
    #[cfg(test)]
    pub(super) const OPEN: Self = Self {
        open: true,
        enterprise_tag: None,
    };
    #[cfg(test)]
    pub(super) const SCOPED: Self = Self {
        open: false,
        enterprise_tag: None,
    };
}

impl<'a> StudioAccess<'a> {
    pub(super) fn from_settings(settings: &'a Settings) -> Self {
        Self {
            open: settings.content_ai_studio_open_access,
            enterprise_tag: settings.content_ai_studio_enterprise_tag.as_deref(),
        }
    }

    #[cfg(test)]
    pub(super) fn with_enterprise_tag(self, tag: &'a str) -> Self {
        Self {
            enterprise_tag: Some(tag),
            ..self
        }
    }

    /// Only originals carrying this tag are read or admitted; `None` = whole library.
    pub(super) fn enterprise_tag(self) -> Option<&'a str> {
        self.enterprise_tag
    }

    pub(super) fn is_open(self) -> bool {
        self.open
    }

    /// Remix source binding: open access skips only the edit-permission part.
    pub(super) fn source_permission(self) -> SourcePermission {
        if self.open {
            SourcePermission::Skip
        } else {
            SourcePermission::Enforce
        }
    }

    /// Batch reads/cancel filter: every batch when open, the caller's otherwise.
    pub(super) fn batch_owner(self, user: &CurrentUser) -> Option<&str> {
        (!self.open).then_some(user.user_id.as_str())
    }
}

/// SQL predicate: remix batch `b` is in the enterprise bound to `$param`
/// (NULL = whole library) when one of its segments comes from a tagged original.
pub(super) fn batch_in_enterprise_sql(param: u8) -> String {
    format!(
        "(${param}::TEXT IS NULL OR EXISTS (SELECT 1 FROM ads.content_remix_batch_runs sr \
         CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(sr.segments) seg \
         JOIN ads.marketing_content_assets sa ON sa.asset_id = (seg->>'assetId')::UUID \
         WHERE sr.batch_id = b.batch_id AND ${param} = ANY(sa.tags)))"
    )
}
