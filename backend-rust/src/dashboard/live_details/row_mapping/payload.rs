use serde_json::Value;

use super::fields::LiveDetailRowFields;

pub(super) fn live_detail_payload_from_fields(
    fields: LiveDetailRowFields,
) -> Result<Value, String> {
    serde_json::to_value(fields).map_err(|error| error.to_string())
}
