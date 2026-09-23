pub(in crate::reports) fn is_undefined_table(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => db_error
            .code()
            .map(|code| {
                // 42P01: undefined_table
                // 42703: undefined_column（用于兼容旧表结构，触发回退查询）
                code == "42P01" || code == "42703"
            })
            .unwrap_or(false),
        _ => false,
    }
}

pub(in crate::reports) fn is_unique_violation(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "23505").unwrap_or(false)
        }
        _ => false,
    }
}

pub(in crate::reports) fn is_legacy_week_unique_violation(error: &sqlx::Error) -> bool {
    if !is_unique_violation(error) {
        return false;
    }

    match error {
        sqlx::Error::Database(db_error) => db_error
            .constraint()
            .map(|name| name == "uq_report_weekly_summary_week_period")
            .unwrap_or(false),
        _ => false,
    }
}
