use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};

pub(super) fn ensure_can_mutate_elevated_roles(
    user: &CurrentUser,
    current_role_codes: &[String],
    next_role_codes: &[String],
) -> AppResult<()> {
    if user.is_super_admin() {
        return Ok(());
    }

    let touches_elevated = current_role_codes
        .iter()
        .any(|code| is_reserved_elevated_role_code(code))
        || next_role_codes
            .iter()
            .any(|code| is_reserved_elevated_role_code(code));

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
