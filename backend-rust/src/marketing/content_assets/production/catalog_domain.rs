use super::types::Clip;
use crate::error::{AppError, AppResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn invalid() -> AppError {
    AppError::bad_request("镜头目录格式、身份或连续时间范围无效")
}
pub(super) fn parse(value: &Value) -> AppResult<(Uuid, String, u32, Vec<Clip>)> {
    if value["schema"] != "aios.shot-catalog.v1"
        || value["timebase"] != "raw-relative-ms"
        || value["coverage"] != "complete"
    {
        return Err(invalid());
    }
    let asset =
        Uuid::parse_str(value["assetId"].as_str().ok_or_else(invalid)?).map_err(|_| invalid())?;
    let hash = value["rawSha256"]
        .as_str()
        .filter(|h| h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(invalid)?
        .to_ascii_lowercase();
    let duration = value["source"]["durationMs"]
        .as_u64()
        .filter(|d| (250..=1_800_000).contains(d))
        .ok_or_else(invalid)? as u32;
    let shots = value["shots"]
        .as_array()
        .filter(|s| !s.is_empty() && s.len() <= 120)
        .ok_or_else(invalid)?;
    let mut clips = Vec::new();
    let mut cursor = 0u32;
    for shot in shots {
        let start = shot["startMs"].as_u64().ok_or_else(invalid)?;
        let end = shot["endMs"].as_u64().ok_or_else(invalid)?;
        if start != u64::from(cursor)
            || end < start + 250
            || end > u64::from(duration)
            || shot["semanticStatus"] != "not_analyzed"
            || !shot.get("observations").is_some_and(Value::is_null)
        {
            return Err(invalid());
        }
        let id = format!("{:x}", Sha256::digest(format!("{hash}:{start}:{end}")))[..24].to_string();
        if shot["shotId"] != id {
            return Err(invalid());
        }
        clips.push(Clip {
            id,
            asset_id: asset,
            start_ms: start as u32,
            end_ms: end as u32,
            caption: String::new(),
            volume: 1.0,
        });
        cursor = end as u32;
    }
    if cursor != duration {
        return Err(invalid());
    }
    Ok((asset, hash, duration, clips))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    pub(super) fn sample() -> Value {
        let hash = "a".repeat(64);
        let id = format!("{:x}", Sha256::digest(format!("{hash}:0:1000")))[..24].to_string();
        json!({"schema":"aios.shot-catalog.v1","assetId":Uuid::nil(),"rawSha256":hash,"timebase":"raw-relative-ms","coverage":"complete","source":{"durationMs":1000},"shots":[{"shotId":id,"startMs":0,"endMs":1000,"semanticStatus":"not_analyzed","observations":null}]})
    }
    #[test]
    fn accepts_grounded_partition_but_never_annotations_or_invented_ids() {
        let v = sample();
        assert_eq!(parse(&v).unwrap().3.len(), 1);
        for (key, val) in [
            ("shotId", json!("invented")),
            ("startMs", json!(1)),
            ("endMs", json!(2000)),
            ("observations", json!({"product":"guess"})),
            ("semanticStatus", json!("verified")),
        ] {
            let mut bad = v.clone();
            bad["shots"][0][key] = val;
            assert!(parse(&bad).is_err());
        }
        let mut bad = v;
        bad["source"]["durationMs"] = json!(1001);
        assert!(parse(&bad).is_err());
    }
}
