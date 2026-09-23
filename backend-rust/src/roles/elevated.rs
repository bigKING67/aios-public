use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};

pub(super) fn ensure_can_mutate_elevated_role(
    user: &CurrentUser,
    target_role_code: Option<&str>,
    next_role_code: Option<&str>,
) -> AppResult<()> {
    if user.is_super_admin() {
        return Ok(());
    }

    let touches_elevated = target_role_code
        .map(is_reserved_elevated_role_code)
        .unwrap_or(false)
        || next_role_code
            .map(is_reserved_elevated_role_code)
            .unwrap_or(false);

    if touches_elevated {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

fn normalize_reserved_role_code(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .replace(char::is_whitespace, "_")
        .replace('-', "_")
}

fn is_reserved_elevated_role_code(raw: &str) -> bool {
    let normalized = normalize_reserved_role_code(raw);
    normalized == "admin" || normalized == "super_admin" || normalized == "superadmin"
}
