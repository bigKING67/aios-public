use super::super::env::resolve_optional_env;

pub(super) fn resolve_feishu_sync_state_table() -> Result<String, String> {
    let raw = resolve_optional_env("DATAOPS_FEISHU_SYNC_STATE_TABLE")
        .or_else(|| resolve_optional_env("PG_SYNC_STATE_TABLE"))
        .unwrap_or_else(|| "sync_state".to_string());

    quote_pg_table_identifier(raw.as_str())
        .map_err(|message| format!("飞书同步水位表配置非法（{}）：{}", raw, message))
}

fn quote_pg_table_identifier(raw: &str) -> Result<String, String> {
    let parts = raw
        .split('.')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    let (schema, table) = match parts.as_slice() {
        [table] => ("public", *table),
        [schema, table] => (*schema, *table),
        _ => return Err("仅支持 table 或 schema.table 格式".to_string()),
    };

    if !is_safe_pg_identifier(schema) || !is_safe_pg_identifier(table) {
        return Err(
            "schema/table 只能包含字母、数字、下划线，且必须以字母或下划线开头".to_string(),
        );
    }

    Ok(format!("\"{}\".\"{}\"", schema, table))
}

fn is_safe_pg_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }

    chars.all(|char| char.is_ascii_alphanumeric() || char == '_')
}

pub(super) fn is_undefined_table_or_column(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => db_error
            .code()
            .map(|code| code == "42P01" || code == "42703")
            .unwrap_or(false),
        _ => false,
    }
}
