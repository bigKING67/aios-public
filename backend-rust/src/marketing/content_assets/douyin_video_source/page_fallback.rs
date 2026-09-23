use std::collections::HashSet;

use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_LENGTH, REFERER, USER_AGENT},
    Client, Response, Url,
};
use serde_json::Value;

use crate::error::{AppError, AppResult};

use super::{
    build_douyin_remote_video_source, collect_play_address_candidates,
    collect_urls_from_play_addr_inner, select_best_candidate_url, DouyinRemoteVideoSource,
    PlayAddressCandidate, DOUYIN_SOURCE_USER_AGENT,
};

const DOUYIN_PAGE_HTML_MAX_BYTES: u64 = 5 * 1024 * 1024;
const DOUYIN_VIDEO_PAGE_PREFIX: &str = "https://www.douyin.com/video/";

static SCRIPT_TAG_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?is)<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script>"#).unwrap());

pub(super) async fn fetch_douyin_video_page_source(
    client: &Client,
    aweme_id: &str,
) -> AppResult<Option<DouyinRemoteVideoSource>> {
    let page_url = build_douyin_video_page_url(aweme_id)?;
    let response = client
        .get(page_url)
        .header(USER_AGENT, DOUYIN_SOURCE_USER_AGENT)
        .header(REFERER, "https://www.douyin.com/")
        .header(
            ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .await
        .map_err(|_| AppError::bad_request("抖音视频页面请求失败，请稍后重试"))?;

    if response.status().is_redirection() {
        return Err(AppError::bad_request(
            "抖音视频页面发生跳转，当前为安全起见不自动跟随跳转",
        ));
    }
    if !response.status().is_success() {
        return Err(AppError::bad_request(format!(
            "抖音视频页面获取失败（HTTP {}），请确认作品仍可访问后重试",
            response.status().as_u16()
        )));
    }

    let html = read_bounded_douyin_page_html(response).await?;
    build_douyin_remote_video_source_from_page(aweme_id, html.as_str())
}

fn build_douyin_video_page_url(aweme_id: &str) -> AppResult<Url> {
    Url::parse(&format!("{DOUYIN_VIDEO_PAGE_PREFIX}{aweme_id}")).map_err(|_| AppError::Internal)
}

async fn read_bounded_douyin_page_html(mut response: Response) -> AppResult<String> {
    if let Some(content_length) = parse_content_length(response.headers().get(CONTENT_LENGTH))? {
        if content_length > DOUYIN_PAGE_HTML_MAX_BYTES {
            return Err(AppError::bad_request("抖音视频页面响应过大，无法安全解析"));
        }
    }

    let mut bytes = Vec::new();
    let mut size_bytes = 0_u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| AppError::bad_request("抖音视频页面读取中断，请稍后重试"))?
    {
        size_bytes = size_bytes.saturating_add(chunk.len() as u64);
        if size_bytes > DOUYIN_PAGE_HTML_MAX_BYTES {
            return Err(AppError::bad_request("抖音视频页面响应过大，无法安全解析"));
        }
        bytes.extend_from_slice(&chunk);
    }

    String::from_utf8(bytes).map_err(|_| AppError::bad_request("抖音视频页面不是合法 UTF-8"))
}

fn parse_content_length(value: Option<&reqwest::header::HeaderValue>) -> AppResult<Option<u64>> {
    let Some(value) = value else {
        return Ok(None);
    };
    value
        .to_str()
        .map_err(|_| AppError::bad_request("抖音视频页面大小响应头不合法"))?
        .parse::<u64>()
        .map(Some)
        .map_err(|_| AppError::bad_request("抖音视频页面大小响应头不合法"))
}

fn build_douyin_remote_video_source_from_page(
    aweme_id: &str,
    html: &str,
) -> AppResult<Option<DouyinRemoteVideoSource>> {
    let json_values = extract_douyin_page_json_values(html);
    let mut candidates = Vec::new();
    let mut title = None;
    for value in &json_values {
        collect_play_address_candidates_from_json(value, &mut candidates);
        if title.is_none() {
            title = extract_first_title(value);
        }
    }
    let Some(download_url) = select_best_candidate_url(candidates) else {
        return Ok(None);
    };
    Ok(Some(build_douyin_remote_video_source(
        aweme_id,
        title,
        download_url,
    )))
}

fn collect_play_address_candidates_from_json(
    value: &Value,
    candidates: &mut Vec<PlayAddressCandidate>,
) {
    match value {
        Value::Object(map) => {
            if let Some(video) = map.get("video").filter(|value| value.is_object()) {
                candidates.extend(collect_play_address_candidates(video));
            }

            let bit_rate = map
                .get("bit_rate")
                .or_else(|| map.get("bitRate"))
                .and_then(Value::as_i64)
                .unwrap_or(0);
            let width = map.get("width").and_then(Value::as_i64).unwrap_or(0);
            collect_urls_from_play_addr_inner(Some(value), bit_rate, width, 20, true, candidates);

            for key in [
                "play_addr",
                "playAddr",
                "play_addr_h264",
                "playAddrH264",
                "play_addr_265",
                "playAddr265",
                "play_addr_256",
                "playAddr256",
                "download_addr",
                "downloadAddr",
            ] {
                let play_addr = map.get(key);
                let width = play_addr
                    .and_then(|value| value.get("width"))
                    .and_then(Value::as_i64)
                    .unwrap_or(width);
                collect_urls_from_play_addr_inner(play_addr, bit_rate, width, 20, true, candidates);
            }

            for child in map.values() {
                collect_play_address_candidates_from_json(child, candidates);
            }
        }
        Value::Array(values) => {
            for child in values {
                collect_play_address_candidates_from_json(child, candidates);
            }
        }
        _ => {}
    }
}

fn extract_douyin_page_json_values(html: &str) -> Vec<Value> {
    let mut values = Vec::new();
    let mut seen = HashSet::new();
    for captures in SCRIPT_TAG_RE.captures_iter(html) {
        let attrs = captures
            .name("attrs")
            .map(|value| value.as_str())
            .unwrap_or_default();
        if !attrs.contains("RENDER_DATA") && !attrs.contains("__UNIVERSAL_DATA_FOR_REHYDRATION__") {
            continue;
        }
        let body = captures
            .name("body")
            .map(|value| value.as_str())
            .unwrap_or_default();
        collect_json_variants(body, &mut seen, &mut values);
    }
    values
}

fn collect_json_variants(raw: &str, seen: &mut HashSet<String>, values: &mut Vec<Value>) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }

    parse_json_variant(trimmed, seen, values);
    let html_decoded = decode_basic_html_entities(trimmed);
    parse_json_variant(html_decoded.as_str(), seen, values);
    if let Some(decoded) = percent_decode_utf8(trimmed) {
        parse_json_variant(decoded.as_str(), seen, values);
    }
    if let Some(decoded) = percent_decode_utf8(html_decoded.as_str()) {
        parse_json_variant(decoded.as_str(), seen, values);
    }
}

fn parse_json_variant(raw: &str, seen: &mut HashSet<String>, values: &mut Vec<Value>) {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
        return;
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        values.push(value);
    }
}

fn decode_basic_html_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#x22;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#x2F;", "/")
        .replace("&amp;", "&")
}

fn percent_decode_utf8(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn extract_first_title(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in ["desc", "description", "title"] {
                if let Some(title) = map
                    .get(key)
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .filter(|value| !value.starts_with("http://"))
                    .filter(|value| !value.starts_with("https://"))
                {
                    return Some(title.chars().take(120).collect::<String>());
                }
            }
            for child in map.values() {
                if let Some(title) = extract_first_title(child) {
                    return Some(title);
                }
            }
            None
        }
        Value::Array(values) => {
            for child in values {
                if let Some(title) = extract_first_title(child) {
                    return Some(title);
                }
            }
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn percent_encode_for_test(value: &str) -> String {
        let mut encoded = String::new();
        for byte in value.as_bytes() {
            if byte.is_ascii_alphanumeric() {
                encoded.push(*byte as char);
            } else {
                encoded.push_str(&format!("%{byte:02X}"));
            }
        }
        encoded
    }

    #[test]
    fn extracts_page_hydration_video_source_from_render_data() {
        let page_json = serde_json::json!({
            "loaderData": {
                "aweme": {
                    "desc": "页面兜底标题",
                    "video": {
                        "play_addr": {
                            "url_list": [
                                "https://v26-web.douyinvod.com/video/page-source.mp4?mime_type=video_mp4"
                            ]
                        }
                    }
                }
            }
        })
        .to_string();
        let html = format!(
            r#"<html><script id="RENDER_DATA" type="application/json">{}</script></html>"#,
            percent_encode_for_test(page_json.as_str())
        );

        let source = build_douyin_remote_video_source_from_page("7649599041366679467", &html)
            .expect("page fallback should parse")
            .expect("page fallback should find source");

        assert_eq!(source.title.as_deref(), Some("页面兜底标题"));
        assert_eq!(
            source.download_url.host_str(),
            Some("v26-web.douyinvod.com")
        );
        assert!(source.download_url.as_str().contains("page-source.mp4"));
    }

    #[test]
    fn extracts_page_hydration_video_source_from_universal_data() {
        let page_json = serde_json::json!({
            "defaultScope": {
                "webapp.video-detail": {
                    "videoInfo": {
                        "bitRate": 2800,
                        "width": 1080,
                        "urlList": [
                            "https://lf3-cdn-tos.bytecdn.cn/obj/tos-cn/video-page.mp4?mime_type=video_mp4"
                        ]
                    }
                }
            }
        });
        let html = format!(
            r#"<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{page_json}</script>"#
        );

        let source = build_douyin_remote_video_source_from_page("7649599041366679467", &html)
            .expect("universal data should parse")
            .expect("universal data should expose source");

        assert_eq!(
            source.download_url.host_str(),
            Some("lf3-cdn-tos.bytecdn.cn")
        );
        assert!(source.download_url.as_str().contains("video-page.mp4"));
    }

    #[test]
    fn page_fallback_ignores_unallowlisted_media_host() {
        let page_json = serde_json::json!({
            "video": {
                "play_addr": {
                    "url_list": [
                        "https://example.com/video/page-source.mp4?mime_type=video_mp4"
                    ]
                }
            }
        });
        let html = format!(
            r#"<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{page_json}</script>"#
        );

        let source = build_douyin_remote_video_source_from_page("7649599041366679467", &html)
            .expect("page fallback should parse");

        assert!(source.is_none());
    }

    #[test]
    fn page_fallback_ignores_non_video_image_urls() {
        let page_json = serde_json::json!({
            "image": {
                "url_list": [
                    "https://p3-pstatp.com/img/poster.jpeg"
                ]
            }
        });
        let html = format!(
            r#"<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{page_json}</script>"#
        );

        let source = build_douyin_remote_video_source_from_page("7649599041366679467", &html)
            .expect("page fallback should parse");

        assert!(source.is_none());
    }
}
