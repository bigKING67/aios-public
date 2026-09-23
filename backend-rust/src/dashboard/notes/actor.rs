use crate::auth::CurrentUser;

use super::super::validation::{can_access_admin, can_write_dashboard_notes};

#[derive(Debug, Clone)]
pub(super) struct DashboardNoteActor {
    pub(super) actor_id: String,
    pub(super) is_admin: bool,
    pub(super) can_write: bool,
}

pub(super) fn build_dashboard_note_actor(current_user: &CurrentUser) -> Option<DashboardNoteActor> {
    let actor_id = current_user
        .username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            let raw_user_id = current_user.user_id.trim().to_string();
            if raw_user_id.is_empty() {
                None
            } else {
                Some(raw_user_id)
            }
        })?;

    Some(DashboardNoteActor {
        actor_id,
        is_admin: can_access_admin(current_user),
        can_write: can_write_dashboard_notes(current_user),
    })
}
