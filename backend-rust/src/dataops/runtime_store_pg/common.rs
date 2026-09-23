use super::super::{env::resolve_env_or, time::format_shanghai_datetime_from_utc};
use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde_json::Value;
use sqlx::{types::Json, Row};

pub(crate) const DEFAULT_RUNTIME_SCHEMA: &str = "dataops";

pub(crate) fn runtime_schema_name() -> Result<String, String> {
    let schema = resolve_env_or("DATAOPS_RUNTIME_PG_SCHEMA", DEFAULT_RUNTIME_SCHEMA);
    if is_safe_pg_identifier(schema.as_str()) {
        Ok(schema)
    } else {
        Err(format!("invalid DATAOPS_RUNTIME_PG_SCHEMA: {schema}"))
    }
}

pub(crate) fn runtime_table(schema: &str, table: &str) -> Result<String, String> {
    if !is_safe_pg_identifier(schema) || !is_safe_pg_identifier(table) {
        return Err("runtime postgres identifier is invalid".to_string());
    }

    Ok(format!("\"{}\".\"{}\"", schema, table))
}

pub(crate) fn deserialize_payload_rows<T: DeserializeOwned>(
    rows: Vec<sqlx::postgres::PgRow>,
) -> Result<Vec<T>, String> {
    let mut items = Vec::new();
    for row in rows {
        let payload = row
            .try_get::<Json<Value>, _>("payload")
            .map_err(|error| format!("runtime payload column read failed: {error}"))?
            .0;
        let item = serde_json::from_value::<T>(payload)
            .map_err(|error| format!("runtime payload deserialization failed: {error}"))?;
        items.push(item);
    }

    Ok(items)
}

pub(crate) fn format_optional_datetime(value: Option<DateTime<Utc>>) -> Option<String> {
    value.map(format_shanghai_datetime_from_utc)
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
