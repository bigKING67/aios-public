use serde_json::{json, Map, Value};
use sqlx::Row;

pub(super) fn split_shortvideo_detail_rows(
    rows: Vec<sqlx::postgres::PgRow>,
) -> Result<(Vec<Value>, Vec<Value>), String> {
    let mut self_rows = Vec::<Value>::new();
    let mut cooperation_rows = Vec::<Value>::new();

    for row in rows {
        let shortvideo_identity_type = row
            .try_get::<String, _>("shortvideo_identity_type")
            .map_err(|error| error.to_string())?;
        let payload_row = map_shortvideo_detail_row(&row)?;

        if shortvideo_identity_type == "self" {
            self_rows.push(payload_row);
        } else if shortvideo_identity_type == "cooperation" {
            cooperation_rows.push(payload_row);
        }
    }

    Ok((self_rows, cooperation_rows))
}

fn map_shortvideo_detail_row(row: &sqlx::postgres::PgRow) -> Result<Value, String> {
    let mut payload_row = Map::<String, Value>::new();
    payload_row.insert(
        "stat_date".to_string(),
        Value::String(read_string(row, "stat_date")?),
    );
    payload_row.insert(
        "publish_time".to_string(),
        read_optional_string(row, "publish_time")?
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    payload_row.insert(
        "account_type".to_string(),
        Value::String(read_string(row, "account_type")?),
    );
    payload_row.insert(
        "video_title".to_string(),
        Value::String(read_string(row, "video_title")?),
    );
    payload_row.insert(
        "video_id".to_string(),
        Value::String(read_string(row, "video_id")?),
    );
    payload_row.insert(
        "is_promoted".to_string(),
        Value::String(read_string(row, "is_promoted")?),
    );
    payload_row.insert(
        "play_url".to_string(),
        read_optional_string(row, "play_url")?
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    payload_row.insert(
        "author_nickname".to_string(),
        Value::String(read_string(row, "author_nickname")?),
    );
    payload_row.insert(
        "author_douyin_id".to_string(),
        Value::String(read_string(row, "author_douyin_id")?),
    );
    payload_row.insert(
        "product_id".to_string(),
        Value::String(read_string(row, "product_id")?),
    );
    payload_row.insert(
        "video_view_count".to_string(),
        json!(read_i64(row, "video_view_count")?),
    );
    payload_row.insert(
        "user_pay_amount".to_string(),
        json!(read_f64(row, "user_pay_amount")?),
    );
    payload_row.insert(
        "refund_amount".to_string(),
        json!(read_f64(row, "refund_amount")?),
    );
    payload_row.insert(
        "live_room_pay_amount".to_string(),
        json!(read_f64(row, "live_room_pay_amount")?),
    );
    payload_row.insert(
        "search_after_view_pay_amount".to_string(),
        json!(read_f64(row, "search_after_view_pay_amount")?),
    );
    payload_row.insert(
        "shop_page_pay_amount".to_string(),
        json!(read_f64(row, "shop_page_pay_amount")?),
    );

    Ok(Value::Object(payload_row))
}

fn read_string(row: &sqlx::postgres::PgRow, column: &str) -> Result<String, String> {
    row.try_get::<String, _>(column)
        .map_err(|error| error.to_string())
}

fn read_optional_string(
    row: &sqlx::postgres::PgRow,
    column: &str,
) -> Result<Option<String>, String> {
    row.try_get::<Option<String>, _>(column)
        .map_err(|error| error.to_string())
}

fn read_i64(row: &sqlx::postgres::PgRow, column: &str) -> Result<i64, String> {
    row.try_get::<i64, _>(column)
        .map_err(|error| error.to_string())
}

fn read_f64(row: &sqlx::postgres::PgRow, column: &str) -> Result<f64, String> {
    row.try_get::<f64, _>(column)
        .map_err(|error| error.to_string())
}
