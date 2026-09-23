use std::time::Duration;

use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT},
    redirect::Policy,
    Client, Url,
};
use serde_json::Value;

use crate::error::{AppError, AppResult};

mod page_fallback;

use page_fallback::fetch_douyin_video_page_source;

const DOUYIN_SOURCE_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 AIOSContentAssetImporter/1.0";
const DOUYIN_DETAIL_TIMEOUT_SECONDS: u64 = 15;
const DOUYIN_DETAIL_PATH: &str = "https://www.douyin.com/aweme/v1/web/aweme/detail/";
const DOUYIN_DETAIL_AID_CANDIDATES: [&str; 2] = ["6383", "1128"];
const DOUYIN_MANUAL_UPLOAD_MESSAGE: &str =
    "当前抖音链接无法直接下载原视频，可能是作品访问受限或抖音接口风控。请改用本地视频上传，上传后再绑定抖音视频 ID。";
const ALLOWED_DOUYIN_MEDIA_HOST_SUFFIXES: [&str; 5] = [
    "douyinvod.com",
    "douyin.com",
    "bytecdn.cn",
    "zjcdn.com",
    "pstatp.com",
];

#[derive(Debug, Clone)]
pub(super) struct DouyinRemoteVideoSource {
    pub(super) aweme_id: String,
    pub(super) title: Option<String>,
    pub(super) download_url: Url,
    pub(super) download_headers: Vec<(String, String)>,
    pub(super) content_type_hint: Option<String>,
}

#[derive(Debug, Clone)]
struct PlayAddressCandidate {
    url: Url,
    bit_rate: i64,
    width: i64,
    source_rank: i64,
    watermarked: bool,
}

pub(super) async fn resolve_douyin_remote_video_source(
    aweme_id: &str,
) -> AppResult<DouyinRemoteVideoSource> {
    let aweme_id = normalize_aweme_id(aweme_id)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(DOUYIN_DETAIL_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| AppError::Internal)?;

    let mut last_status: Option<u16> = None;
    let mut detail_source_error: Option<AppError> = None;
    let mut detail_filter_error: Option<String> = None;
    for aid in DOUYIN_DETAIL_AID_CANDIDATES {
        let detail = fetch_douyin_detail(
            &client,
            &aweme_id,
            aid,
            &mut last_status,
            &mut detail_filter_error,
        )
        .await?;
        if let Some(detail) = detail {
            match build_douyin_remote_video_source_from_detail(&aweme_id, &detail) {
                Ok(source) => return Ok(source),
                Err(error) => detail_source_error = Some(error),
            }
        }
    }

    match fetch_douyin_video_page_source(&client, &aweme_id).await {
        Ok(Some(source)) => return Ok(source),
        Ok(None) => {}
        Err(error) => {
            if detail_source_error.is_some() {
                return Err(AppError::bad_request(format!(
                    "抖音视频详情未返回可下载视频源，页面兜底也失败：{}；{}",
                    error.detail(),
                    DOUYIN_MANUAL_UPLOAD_MESSAGE
                )));
            }
            if let Some(filter_error) = detail_filter_error {
                return Err(AppError::bad_request(format!(
                    "抖音视频当前不可访问：{filter_error}，无法下载入库"
                )));
            }
            return Err(douyin_manual_upload_error());
        }
    }

    if let Some(error) = detail_source_error {
        return Err(AppError::bad_request(format!(
            "{}；页面兜底也未找到可下载视频源；{}",
            error.detail(),
            DOUYIN_MANUAL_UPLOAD_MESSAGE
        )));
    }
    if let Some(filter_error) = detail_filter_error {
        return Err(AppError::bad_request(format!(
            "抖音视频当前不可访问：{filter_error}，无法下载入库"
        )));
    }
    if let Some(status) = last_status {
        return Err(AppError::bad_request(format!(
            "抖音视频详情获取失败（HTTP {status}）；{}",
            DOUYIN_MANUAL_UPLOAD_MESSAGE
        )));
    }
    Err(douyin_manual_upload_error())
}

async fn fetch_douyin_detail(
    client: &Client,
    aweme_id: &str,
    aid: &str,
    last_status: &mut Option<u16>,
    detail_filter_error: &mut Option<String>,
) -> AppResult<Option<Value>> {
    let detail_url = build_douyin_detail_url(aweme_id, aid)?;
    let response = client
        .get(detail_url)
        .header(USER_AGENT, DOUYIN_SOURCE_USER_AGENT)
        .header(REFERER, "https://www.douyin.com/?recommend=1")
        .header(ACCEPT, "application/json,text/plain,*/*")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .await
        .map_err(|_| AppError::bad_request("抖音视频详情请求失败，请稍后重试"))?;

    if !response.status().is_success() {
        *last_status = Some(response.status().as_u16());
        return Ok(None);
    }

    let body = response
        .bytes()
        .await
        .map_err(|_| AppError::bad_request("抖音视频详情读取中断，请稍后重试"))?;
    let Some(data) = parse_douyin_detail_response(&body) else {
        return Ok(None);
    };
    if let Some(detail) = data.get("aweme_detail").filter(|value| value.is_object()) {
        return Ok(Some(detail.clone()));
    }
    if let Some(message) = extract_filter_detail_message(&data) {
        *detail_filter_error = Some(message);
        return Ok(None);
    }
    Ok(None)
}

fn parse_douyin_detail_response(body: &[u8]) -> Option<Value> {
    if body.iter().all(u8::is_ascii_whitespace) {
        return None;
    }
    let Ok(data) = serde_json::from_slice::<Value>(body) else {
        return None;
    };
    Some(data)
}

fn douyin_manual_upload_error() -> AppError {
    AppError::bad_request(DOUYIN_MANUAL_UPLOAD_MESSAGE)
}

fn extract_filter_detail_message(data: &Value) -> Option<String> {
    let filter_detail = data.get("filter_detail")?;
    let reason = filter_detail
        .get("filter_reason")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let message = filter_detail
        .get("detail_msg")
        .or_else(|| filter_detail.get("notice"))
        .or_else(|| filter_detail.get("status_msg"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    match (message, reason) {
        (Some(message), Some(reason)) => Some(format!("{message}（{reason}）")),
        (Some(message), None) => Some(message.to_string()),
        (None, Some(reason)) => Some(reason.to_string()),
        (None, None) => None,
    }
}

fn build_douyin_detail_url(aweme_id: &str, aid: &str) -> AppResult<Url> {
    let mut url = Url::parse(DOUYIN_DETAIL_PATH).map_err(|_| AppError::Internal)?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("device_platform", "webapp")
            .append_pair("aid", aid)
            .append_pair("channel", "channel_pc_web")
            .append_pair("aweme_id", aweme_id)
            .append_pair("update_version_code", "170400")
            .append_pair("pc_client_type", "1")
            .append_pair("pc_libra_divert", "Windows")
            .append_pair("version_code", "290100")
            .append_pair("version_name", "29.1.0")
            .append_pair("cookie_enabled", "true")
            .append_pair("screen_width", "1536")
            .append_pair("screen_height", "864")
            .append_pair("browser_language", "zh-CN")
            .append_pair("browser_platform", "Win32")
            .append_pair("browser_name", "Chrome")
            .append_pair("browser_version", "139.0.0.0")
            .append_pair("browser_online", "true")
            .append_pair("engine_name", "Blink")
            .append_pair("engine_version", "139.0.0.0")
            .append_pair("os_name", "Windows")
            .append_pair("os_version", "10")
            .append_pair("cpu_core_num", "16")
            .append_pair("device_memory", "8")
            .append_pair("platform", "PC")
            .append_pair("downlink", "10")
            .append_pair("effective_type", "4g")
            .append_pair("round_trip_time", "200")
            .append_pair("support_h265", "1")
            .append_pair("support_dash", "1")
            .append_pair("uifid", "");
    }
    Ok(url)
}

fn build_douyin_remote_video_source_from_detail(
    aweme_id: &str,
    detail: &Value,
) -> AppResult<DouyinRemoteVideoSource> {
    let video = detail
        .get("video")
        .filter(|value| value.is_object())
        .ok_or_else(|| AppError::bad_request("抖音视频详情未包含 video 信息"))?;
    let download_url = select_best_play_url(video)?;
    let title = detail
        .get("desc")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(120).collect::<String>());

    Ok(build_douyin_remote_video_source(
        aweme_id,
        title,
        download_url,
    ))
}

fn build_douyin_remote_video_source(
    aweme_id: &str,
    title: Option<String>,
    download_url: Url,
) -> DouyinRemoteVideoSource {
    let content_type_hint = infer_content_type_hint(&download_url);
    DouyinRemoteVideoSource {
        aweme_id: aweme_id.to_string(),
        title,
        download_url,
        download_headers: vec![
            (
                "User-Agent".to_string(),
                DOUYIN_SOURCE_USER_AGENT.to_string(),
            ),
            ("Referer".to_string(), "https://www.douyin.com/".to_string()),
            (
                "Accept".to_string(),
                "video/*,application/octet-stream;q=0.9,*/*;q=0.1".to_string(),
            ),
        ],
        content_type_hint,
    }
}

fn select_best_play_url(video: &Value) -> AppResult<Url> {
    select_best_candidate_url(collect_play_address_candidates(video))
        .ok_or_else(|| AppError::bad_request("抖音视频详情未返回可下载源视频地址"))
}

fn select_best_candidate_url(mut candidates: Vec<PlayAddressCandidate>) -> Option<Url> {
    candidates.sort_by_key(|candidate| {
        (
            candidate.watermarked,
            candidate.source_rank,
            -candidate.bit_rate,
            -candidate.width,
        )
    });
    candidates.into_iter().next().map(|candidate| candidate.url)
}

fn collect_play_address_candidates(video: &Value) -> Vec<PlayAddressCandidate> {
    let mut candidates = Vec::new();
    if let Some(bit_rates) = video.get("bit_rate").and_then(Value::as_array) {
        for entry in bit_rates {
            let bit_rate = entry.get("bit_rate").and_then(Value::as_i64).unwrap_or(0);
            let width = entry
                .get("play_addr")
                .and_then(|play_addr| play_addr.get("width"))
                .and_then(Value::as_i64)
                .or_else(|| entry.get("width").and_then(Value::as_i64))
                .unwrap_or(0);
            collect_urls_from_play_addr(
                entry.get("play_addr"),
                bit_rate,
                width,
                0,
                &mut candidates,
            );
        }
    }

    let fallback_keys = [
        "play_addr_h264",
        "play_addr_265",
        "play_addr_256",
        "play_addr",
        "download_addr",
    ];
    for (index, key) in fallback_keys.iter().enumerate() {
        let source_rank = (index + 1) as i64;
        let play_addr = video.get(*key);
        let width = play_addr
            .and_then(|value| value.get("width"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        collect_urls_from_play_addr(play_addr, 0, width, source_rank, &mut candidates);
    }
    candidates
}

fn collect_urls_from_play_addr(
    play_addr: Option<&Value>,
    bit_rate: i64,
    width: i64,
    source_rank: i64,
    candidates: &mut Vec<PlayAddressCandidate>,
) {
    collect_urls_from_play_addr_inner(play_addr, bit_rate, width, source_rank, false, candidates);
}

fn collect_urls_from_play_addr_inner(
    play_addr: Option<&Value>,
    bit_rate: i64,
    width: i64,
    source_rank: i64,
    require_video_shape: bool,
    candidates: &mut Vec<PlayAddressCandidate>,
) {
    let Some(urls) = play_addr
        .and_then(|value| value.get("url_list").or_else(|| value.get("urlList")))
        .and_then(Value::as_array)
    else {
        return;
    };

    for value in urls {
        let Some(raw_url) = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Ok(url) = Url::parse(raw_url) else {
            continue;
        };
        if !is_allowed_douyin_media_url(&url) {
            continue;
        }
        if require_video_shape && !is_likely_video_media_url(&url) {
            continue;
        }
        candidates.push(PlayAddressCandidate {
            watermarked: is_watermarked_media_url(url.as_str()),
            url,
            bit_rate,
            width,
            source_rank,
        });
    }
}

fn normalize_aweme_id(value: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if (10..=24).contains(&trimmed.len()) && trimmed.as_bytes().iter().all(u8::is_ascii_digit) {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::bad_request("抖音视频 ID 不合法，无法下载源视频"))
    }
}

fn is_allowed_douyin_media_url(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url
        .host_str()
        .map(|host| host.trim_end_matches('.').to_ascii_lowercase())
    else {
        return false;
    };
    ALLOWED_DOUYIN_MEDIA_HOST_SUFFIXES
        .iter()
        .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
}

fn is_likely_video_media_url(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let path = url.path().to_ascii_lowercase();
    host.contains("vod")
        || path.contains("/video/")
        || matches!(
            path.rsplit('.').next(),
            Some("mp4" | "m4v" | "mov" | "webm" | "mkv")
        )
        || url.query_pairs().any(|(key, value)| {
            key.eq_ignore_ascii_case("mime_type") && value.to_ascii_lowercase().starts_with("video")
        })
}

fn is_watermarked_media_url(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("watermark=1") || normalized.contains("watermark%3d1")
}

fn infer_content_type_hint(url: &Url) -> Option<String> {
    if url.query_pairs().any(|(key, value)| {
        key.eq_ignore_ascii_case("mime_type") && value.eq_ignore_ascii_case("video_mp4")
    }) {
        return Some("video/mp4".to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_highest_bitrate_non_watermarked_douyinvod_url() {
        let video = serde_json::json!({
            "bit_rate": [
                {
                    "bit_rate": 1000,
                    "play_addr": {
                        "width": 720,
                        "url_list": [
                            "https://v1-web.douyinvod.com/video/low.mp4?mime_type=video_mp4"
                        ]
                    }
                },
                {
                    "bit_rate": 3000,
                    "play_addr": {
                        "width": 1920,
                        "url_list": [
                            "https://v2-web.douyinvod.com/video/high.mp4?mime_type=video_mp4"
                        ]
                    }
                }
            ]
        });

        let url = select_best_play_url(&video).expect("best URL should resolve");

        assert_eq!(url.host_str(), Some("v2-web.douyinvod.com"));
        assert!(url.as_str().contains("high.mp4"));
    }

    #[test]
    fn prefers_non_watermarked_url_over_watermarked_url() {
        let video = serde_json::json!({
            "bit_rate": [
                {
                    "bit_rate": 4000,
                    "play_addr": {
                        "width": 1920,
                        "url_list": [
                            "https://v2-web.douyinvod.com/video/high.mp4?watermark=1",
                            "https://v2-web.douyinvod.com/video/high-clean.mp4?mime_type=video_mp4"
                        ]
                    }
                }
            ]
        });

        let url = select_best_play_url(&video).expect("best URL should resolve");

        assert!(url.as_str().contains("high-clean.mp4"));
    }

    #[test]
    fn rejects_unallowlisted_media_host() {
        let video = serde_json::json!({
            "play_addr": {
                "url_list": [
                    "https://example.com/video/high.mp4?mime_type=video_mp4"
                ]
            }
        });

        let error = select_best_play_url(&video).expect_err("unallowlisted host should reject");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn extracts_filter_detail_message_for_unavailable_video() {
        let detail = serde_json::json!({
            "aweme_detail": null,
            "filter_detail": {
                "detail_msg": "因作品权限或已被删除，无法观看，去看看其他作品吧",
                "filter_reason": "status_deleted",
                "notice": "抱歉，作品不见了"
            }
        });

        let message = extract_filter_detail_message(&detail)
            .expect("filter detail should produce visible message");

        assert_eq!(
            message,
            "因作品权限或已被删除，无法观看，去看看其他作品吧（status_deleted）"
        );
    }

    #[test]
    fn ignores_empty_detail_response_body() {
        let detail = parse_douyin_detail_response(b" \n\t ");

        assert!(detail.is_none());
    }

    #[test]
    fn ignores_non_json_detail_response_body() {
        let detail = parse_douyin_detail_response(b"<html><body>challenge</body></html>");

        assert!(detail.is_none());
    }

    #[test]
    fn parses_aweme_detail_response_and_keeps_download_selection() {
        let response = serde_json::json!({
            "aweme_detail": {
                "desc": "示例视频",
                "video": {
                    "play_addr": {
                        "url_list": [
                            "https://v1-web.douyinvod.com/video/page-source.mp4?mime_type=video_mp4"
                        ]
                    }
                }
            }
        });
        let body = serde_json::to_vec(&response).expect("fixture should serialize");
        let detail = parse_douyin_detail_response(&body)
            .and_then(|data| data.get("aweme_detail").cloned())
            .expect("aweme detail should parse");

        let source = build_douyin_remote_video_source_from_detail("7655200558651573888", &detail)
            .expect("source should resolve");

        assert_eq!(source.aweme_id, "7655200558651573888");
        assert_eq!(source.title.as_deref(), Some("示例视频"));
        assert!(source.download_url.as_str().contains("page-source.mp4"));
    }
}
