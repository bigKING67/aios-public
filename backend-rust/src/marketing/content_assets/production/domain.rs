use std::collections::HashSet;

use super::types::SaveRequest;
use crate::error::{AppError, AppResult};

pub(super) fn validate(request: &SaveRequest) -> AppResult<()> {
    if request.title.trim().is_empty() || request.title.chars().count() > 120 {
        return Err(AppError::bad_request("项目名称需为 1–120 个字符"));
    }
    if !["landscape", "portrait", "square"].contains(&request.aspect.as_str()) {
        return Err(AppError::bad_request("不支持的画幅"));
    }
    if !request.rights_confirmed {
        return Err(AppError::bad_request("请先确认所选素材可用于本次制作"));
    }
    if request.clips.is_empty() || request.clips.len() > 100 {
        return Err(AppError::bad_request("每个工程需包含 1–100 个片段"));
    }
    let mut ids = HashSet::new();
    let mut duration: u64 = 0;
    for clip in &request.clips {
        if clip.id.is_empty()
            || clip.id.len() > 64
            || !clip
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
            || !ids.insert(&clip.id)
        {
            return Err(AppError::bad_request("片段标识无效或重复"));
        }
        if clip.end_ms <= clip.start_ms
            || clip.end_ms > 1_800_000
            || clip.end_ms - clip.start_ms < 100
        {
            return Err(AppError::bad_request("片段时间范围无效，最短 0.1 秒"));
        }
        if !clip.volume.is_finite()
            || !(0.0..=1.0).contains(&clip.volume)
            || clip.caption.chars().count() > 1000
        {
            return Err(AppError::bad_request("音量或字幕超出范围"));
        }
        duration += u64::from(clip.end_ms - clip.start_ms);
    }
    if duration > 600_000 {
        return Err(AppError::bad_request("成片不能超过 10 分钟"));
    }
    Ok(())
}

pub(super) fn segment(value: &serde_json::Value) -> Option<(u32, u32, String)> {
    let start = u32::try_from(value.get("start_ms")?.as_u64()?).ok()?;
    let end = u32::try_from(value.get("end_ms")?.as_u64()?).ok()?;
    let text = value.get("text")?.as_str()?.trim();
    if end <= start || end > 1_800_000 || text.is_empty() {
        return None;
    }
    Some((start, end, text.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn segment_requires_real_millisecond_evidence() {
        assert!(segment(&json!({"start_time":"0:01","end_time":"0:02","text":"x"})).is_none());
        assert!(segment(&json!({"start_ms":1000,"end_ms":500,"text":"x"})).is_none());
        assert_eq!(
            segment(&json!({"start_ms":1000,"end_ms":2000,"text":"台词"}))
                .unwrap()
                .0,
            1000
        );
    }
    #[test]
    fn edit_rejects_unconfirmed_rights_duplicate_ids_and_bad_time() {
        let value = json!({"title":"测试","aspect":"portrait","rightsConfirmed":true,"clips":[{"id":"c1","assetId":uuid::Uuid::nil(),"startMs":0,"endMs":1000,"caption":"台词","volume":1}]});
        let mut request: SaveRequest = serde_json::from_value(value).unwrap();
        assert!(validate(&request).is_ok());
        request.rights_confirmed = false;
        assert!(validate(&request).is_err());
        request.rights_confirmed = true;
        request.clips.push(request.clips[0].clone());
        assert!(validate(&request).is_err());
        request.clips.pop();
        request.clips[0].end_ms = 0;
        assert!(validate(&request).is_err());
    }
}
