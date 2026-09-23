mod fields;
mod payload;

use serde_json::Value;

use self::{fields::LiveDetailRowFields, payload::live_detail_payload_from_fields};

pub(super) fn live_detail_payload_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<(String, Value), String> {
    let fields = LiveDetailRowFields::from_row(row)?;
    let live_identity_type = fields.live_identity_type.clone();
    let payload_row = live_detail_payload_from_fields(fields)?;

    Ok((live_identity_type, payload_row))
}
