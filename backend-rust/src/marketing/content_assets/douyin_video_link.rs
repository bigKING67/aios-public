use std::{collections::HashSet, time::Duration};

use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::header::{LOCATION, USER_AGENT};
use reqwest::{redirect::Policy, Client, Url};

use crate::error::{AppError, AppResult};

const DOUYIN_RESOLVE_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_DOUYIN_REDIRECTS: usize = 5;
const DOUYIN_REQUEST_TIMEOUT_SECONDS: u64 = 8;

static URL_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"https?://[^\s"'<>()]+"#).expect("valid URL regex"));
static DOUYIN_VIDEO_ID_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/video/(\d+)").expect("valid Douyin video id regex"));
static QIANCHUAN_MATERIAL_ID_CONTEXT_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:material[_\s-]?id|ad[_\s-]?material[_\s-]?id|external[_\s-]?material[_\s-]?id|素材\s*ID|千川素材\s*ID)\s*[:：=]?\s*(\d{16,22})",
    )
    .expect("valid Qianchuan material id context regex")
});
static WRAPPED_SHORT_DOUYIN_URL_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(https?://v\.douyin\.com/)\s+([A-Za-z0-9_-]+/?)")
        .expect("valid wrapped short Douyin URL regex")
});
static WRAPPED_LONG_DOUYIN_URL_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(https?://(?:www\.)?douyin\.com/video/)\s+(\d+)")
        .expect("valid wrapped long Douyin URL regex")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ResolvedDouyinVideoId {
    pub(super) source_url: String,
    pub(super) resolved_url: String,
    pub(super) external_video_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum VideoLinkSourceType {
    DouyinVideo,
    QianchuanMaterialVideo,
}

impl VideoLinkSourceType {
    pub(super) fn as_str(&self) -> &'static str {
        match self {
            Self::DouyinVideo => "douyin_video",
            Self::QianchuanMaterialVideo => "qianchuan_material_video",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct VideoLinkPreviewCandidate {
    pub(super) source_type: VideoLinkSourceType,
    pub(super) source_url: String,
    pub(super) resolved_url: String,
    pub(super) external_video_id: Option<String>,
    pub(super) external_item_id: Option<String>,
}

pub(super) async fn resolve_douyin_video_id(input: &str) -> AppResult<ResolvedDouyinVideoId> {
    let source_url = extract_supported_douyin_url(input)?;
    if let Some(external_video_id) = extract_video_id_from_url(&source_url) {
        return Ok(ResolvedDouyinVideoId {
            source_url: source_url.to_string(),
            resolved_url: source_url.to_string(),
            external_video_id,
        });
    }

    if !is_douyin_short_link(&source_url) {
        return Err(video_id_not_found_error());
    }

    resolve_short_douyin_link(&source_url).await
}

pub(super) async fn preview_video_links(input: &str) -> AppResult<Vec<VideoLinkPreviewCandidate>> {
    let source_urls = extract_supported_video_urls(input)?;
    let mut candidates = Vec::with_capacity(source_urls.len());
    for source_url in source_urls {
        if ensure_allowed_douyin_url(&source_url).is_ok() {
            if let Some(candidate) = preview_douyin_video_link(&source_url).await? {
                candidates.push(candidate);
            }
            continue;
        }
        if is_qianchuan_material_video_url(&source_url) {
            candidates.push(preview_qianchuan_material_video_link(&source_url, input));
        }
    }

    if candidates.is_empty() {
        return Err(AppError::bad_request(
            "未识别到支持的视频链接；当前支持抖音视频链接、v.douyin.com 分享短链和千川素材视频链接",
        ));
    }
    Ok(candidates)
}

fn extract_supported_douyin_url(input: &str) -> AppResult<Url> {
    let normalized_input = normalize_wrapped_douyin_urls(input.trim());
    let mut saw_url = false;
    for matched in URL_PATTERN.find_iter(normalized_input.as_str()) {
        saw_url = true;
        let candidate = trim_url_trailing_punctuation(matched.as_str());
        if candidate.is_empty() {
            continue;
        }
        let Ok(url) = Url::parse(candidate) else {
            continue;
        };
        if ensure_allowed_douyin_url(&url).is_ok() {
            return Ok(url);
        }
    }

    if saw_url {
        Err(AppError::bad_request(
            "仅支持 douyin.com / www.douyin.com / v.douyin.com 抖音链接",
        ))
    } else {
        Err(AppError::bad_request("未在文本中找到抖音链接"))
    }
}

fn extract_supported_video_urls(input: &str) -> AppResult<Vec<Url>> {
    let normalized_input = normalize_wrapped_douyin_urls(input.trim());
    let mut saw_url = false;
    let mut seen = HashSet::new();
    let mut urls = Vec::new();
    for matched in URL_PATTERN.find_iter(normalized_input.as_str()) {
        saw_url = true;
        let candidate = trim_url_trailing_punctuation(matched.as_str());
        if candidate.is_empty() {
            continue;
        }
        let Ok(url) = Url::parse(candidate) else {
            continue;
        };
        if ensure_allowed_douyin_url(&url).is_ok() || is_qianchuan_material_video_url(&url) {
            let key = url.as_str().to_string();
            if seen.insert(key) {
                urls.push(url);
            }
        }
    }

    if !urls.is_empty() {
        return Ok(urls);
    }
    if saw_url {
        Err(AppError::bad_request(
            "仅支持抖音视频链接或千川素材视频链接",
        ))
    } else {
        Err(AppError::bad_request("未在文本中找到视频链接"))
    }
}

fn normalize_wrapped_douyin_urls(input: &str) -> String {
    let normalized_short = WRAPPED_SHORT_DOUYIN_URL_PATTERN.replace_all(input, "$1$2");
    WRAPPED_LONG_DOUYIN_URL_PATTERN
        .replace_all(normalized_short.as_ref(), "$1$2")
        .into_owned()
}

fn trim_url_trailing_punctuation(value: &str) -> &str {
    value.trim_end_matches([
        '.', ',', '，', '。', ';', '；', '!', '！', '?', '？', ')', '）', ']', '】', '}',
    ])
}

fn ensure_allowed_douyin_url(url: &Url) -> AppResult<()> {
    ensure_allowed_douyin_host(url, &["douyin.com", "www.douyin.com", "v.douyin.com"])
}

fn ensure_allowed_douyin_redirect_url(url: &Url) -> AppResult<()> {
    ensure_allowed_douyin_host(
        url,
        &[
            "douyin.com",
            "www.douyin.com",
            "v.douyin.com",
            "www.iesdouyin.com",
        ],
    )
}

fn ensure_allowed_douyin_host(url: &Url, allowed_hosts: &[&str]) -> AppResult<()> {
    let scheme = url.scheme();
    if scheme != "https" && scheme != "http" {
        return Err(AppError::bad_request("抖音链接必须使用 http 或 https"));
    }
    let Some(host) = normalized_host(url) else {
        return Err(AppError::bad_request("抖音链接缺少域名"));
    };
    if allowed_hosts
        .iter()
        .any(|allowed_host| host == *allowed_host)
    {
        return Ok(());
    }
    Err(AppError::bad_request(
        "仅支持 douyin.com / www.douyin.com / v.douyin.com 抖音链接",
    ))
}

fn normalized_host(url: &Url) -> Option<String> {
    url.host_str()
        .map(|host| host.trim_end_matches('.').to_ascii_lowercase())
}

fn is_douyin_short_link(url: &Url) -> bool {
    normalized_host(url).as_deref() == Some("v.douyin.com")
}

pub(super) fn is_qianchuan_material_video_url(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    if normalized_host(url).as_deref() != Some("v6-adadmin.oceanengine.com") {
        return false;
    }
    let path = url.path().to_ascii_lowercase();
    if path.contains("/video/tos/") {
        return true;
    }
    url.query_pairs().any(|(key, value)| {
        key.eq_ignore_ascii_case("mime_type") && value.eq_ignore_ascii_case("video_mp4")
    })
}

fn extract_video_id_from_url(url: &Url) -> Option<String> {
    DOUYIN_VIDEO_ID_PATTERN
        .captures(url.as_str())
        .and_then(|captures| captures.get(1))
        .map(|matched| matched.as_str().to_string())
}

async fn preview_douyin_video_link(
    source_url: &Url,
) -> AppResult<Option<VideoLinkPreviewCandidate>> {
    if let Some(external_video_id) = extract_video_id_from_url(source_url) {
        return Ok(Some(VideoLinkPreviewCandidate {
            source_type: VideoLinkSourceType::DouyinVideo,
            source_url: source_url.to_string(),
            resolved_url: source_url.to_string(),
            external_video_id: Some(external_video_id),
            external_item_id: None,
        }));
    }

    if !is_douyin_short_link(source_url) {
        return Ok(None);
    }

    let resolved = resolve_short_douyin_link(source_url).await?;
    Ok(Some(VideoLinkPreviewCandidate {
        source_type: VideoLinkSourceType::DouyinVideo,
        source_url: resolved.source_url,
        resolved_url: resolved.resolved_url,
        external_video_id: Some(resolved.external_video_id),
        external_item_id: None,
    }))
}

fn preview_qianchuan_material_video_link(
    source_url: &Url,
    input: &str,
) -> VideoLinkPreviewCandidate {
    VideoLinkPreviewCandidate {
        source_type: VideoLinkSourceType::QianchuanMaterialVideo,
        source_url: source_url.to_string(),
        resolved_url: source_url.to_string(),
        external_video_id: None,
        external_item_id: extract_qianchuan_material_id(source_url, input),
    }
}

fn extract_qianchuan_material_id(source_url: &Url, input: &str) -> Option<String> {
    for (key, value) in source_url.query_pairs() {
        if is_material_id_query_key(key.as_ref()) && is_plausible_material_id(value.as_ref()) {
            return Some(value.into_owned());
        }
    }

    let search_text = qianchuan_material_id_search_window(source_url, input);
    QIANCHUAN_MATERIAL_ID_CONTEXT_PATTERN
        .captures(search_text.as_str())
        .and_then(|captures| captures.get(1))
        .map(|matched| matched.as_str().to_string())
}

fn qianchuan_material_id_search_window(source_url: &Url, input: &str) -> String {
    const CONTEXT_CHARS: usize = 120;
    let source_url = source_url.as_str();
    let Some(url_start) = input.find(source_url) else {
        return String::new();
    };
    let url_end = url_start + source_url.len();
    let start = input[..url_start]
        .char_indices()
        .rev()
        .nth(CONTEXT_CHARS.saturating_sub(1))
        .map(|(index, _)| index)
        .unwrap_or(0);
    let end = input[url_end..]
        .char_indices()
        .nth(CONTEXT_CHARS)
        .map(|(index, _)| url_end + index)
        .unwrap_or_else(|| input.len());
    input[start..end].to_string()
}

fn is_material_id_query_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "material_id"
            | "materialid"
            | "ad_material_id"
            | "admaterialid"
            | "external_material_id"
            | "externalmaterialid"
    )
}

fn is_plausible_material_id(value: &str) -> bool {
    let len = value.len();
    (16..=22).contains(&len) && value.as_bytes().iter().all(u8::is_ascii_digit)
}

async fn resolve_short_douyin_link(source_url: &Url) -> AppResult<ResolvedDouyinVideoId> {
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(DOUYIN_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| AppError::Internal)?;
    let mut current_url = source_url.clone();

    for _ in 0..MAX_DOUYIN_REDIRECTS {
        ensure_allowed_douyin_redirect_url(&current_url)?;
        let response = client
            .get(current_url.clone())
            .header(USER_AGENT, DOUYIN_RESOLVE_USER_AGENT)
            .send()
            .await
            .map_err(|_| {
                AppError::bad_request("抖音短链解析失败，请稍后重试或手动填写抖音视频ID")
            })?;

        if !response.status().is_redirection() {
            if let Some(external_video_id) = extract_video_id_from_url(response.url()) {
                return Ok(ResolvedDouyinVideoId {
                    source_url: source_url.to_string(),
                    resolved_url: response.url().to_string(),
                    external_video_id,
                });
            }
            return Err(video_id_not_found_error());
        }

        let location = response
            .headers()
            .get(LOCATION)
            .ok_or_else(video_id_not_found_error)?
            .to_str()
            .map_err(|_| video_id_not_found_error())?;
        let next_url = current_url
            .join(location)
            .map_err(|_| AppError::bad_request("抖音短链跳转地址不合法"))?;
        ensure_allowed_douyin_redirect_url(&next_url)?;

        if let Some(external_video_id) = extract_video_id_from_url(&next_url) {
            if normalized_host(&next_url).as_deref() == Some("www.iesdouyin.com") {
                current_url = next_url;
                continue;
            }
            return Ok(ResolvedDouyinVideoId {
                source_url: source_url.to_string(),
                resolved_url: next_url.to_string(),
                external_video_id,
            });
        }

        current_url = next_url;
    }

    Err(AppError::bad_request(
        "抖音短链跳转次数过多，请手动填写抖音视频ID",
    ))
}

fn video_id_not_found_error() -> AppError {
    AppError::bad_request("未能从抖音链接提取视频ID，请手动填写抖音视频ID")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_video_id_from_long_web_url() {
        let url = extract_supported_douyin_url("https://www.douyin.com/video/7649697971252261370")
            .expect("long URL should parse");

        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn extracts_video_id_from_long_web_url_with_query() {
        let url = extract_supported_douyin_url(
            "https://www.douyin.com/video/7649697971252261370?previous_page=app_code_link",
        )
        .expect("long URL with query should parse");

        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn extracts_first_url_from_share_text() {
        let url = extract_supported_douyin_url(
            "4.38 copy and open Douyin https://v.douyin.com/peda0RLEj3Q/ lcA:/ H@i.pD",
        )
        .expect("share text should expose URL");

        assert_eq!(url.as_str(), "https://v.douyin.com/peda0RLEj3Q/");
        assert!(is_douyin_short_link(&url));
    }

    #[test]
    fn extracts_wrapped_mobile_share_short_link() {
        let url = extract_supported_douyin_url(
            "4.38 复制打开抖音，看看【七月🌞的作品】姐妹们这个真的可以安排上# Groland白金洗发... https://v.douyin.com/\n  peda0RLEj3Q/ lcA:/ H@i.pD :5pm 12/26",
        )
        .expect("wrapped share text should expose URL");

        assert_eq!(url.as_str(), "https://v.douyin.com/peda0RLEj3Q/");
        assert!(is_douyin_short_link(&url));
    }

    #[test]
    fn extracts_wrapped_long_web_url() {
        let url =
            extract_supported_douyin_url("https://www.douyin.com/video/\n  7649697971252261370")
                .expect("wrapped long URL should parse");

        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn extracts_first_supported_url_from_share_text() {
        let url = extract_supported_douyin_url(
            "ignore https://example.com/video/7649697971252261370 then https://www.douyin.com/video/7649697971252261370",
        )
        .expect("share text should expose the first supported Douyin URL");

        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn rejects_non_douyin_hosts() {
        let error = extract_supported_douyin_url("https://example.com/video/7649697971252261370")
            .expect_err("non-Douyin host should fail");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_unallowlisted_douyin_subdomains() {
        let error =
            extract_supported_douyin_url("https://evil.douyin.com/video/7649697971252261370")
                .expect_err("unallowlisted Douyin subdomain should fail");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_official_redirect_intermediate_as_direct_input() {
        let error = extract_supported_douyin_url(
            "https://www.iesdouyin.com/share/video/7649697971252261370/",
        )
        .expect_err("redirect intermediate host should not be accepted as operator input");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn allows_official_iesdouyin_redirect_intermediate() {
        let url = Url::parse("https://www.iesdouyin.com/share/video/7649697971252261370/")
            .expect("test URL should parse");

        assert!(ensure_allowed_douyin_redirect_url(&url).is_ok());
        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn trims_trailing_share_punctuation() {
        let url =
            extract_supported_douyin_url("https://www.douyin.com/video/7649697971252261370，")
                .expect("URL should parse after punctuation trim");

        assert_eq!(
            extract_video_id_from_url(&url).as_deref(),
            Some("7649697971252261370")
        );
    }

    #[tokio::test]
    async fn previews_qianchuan_material_video_source_without_guessing_material_id() {
        let candidates = preview_video_links(
            "https://v6-adadmin.oceanengine.com/abf47c17cf033ad0cb68930eca08968f/d46478af/video/tos/cn/tos-cn-ve-15/ok1BjiLWtgGslNAAL8lAecIRU3RS7etBEGelpC/?a=415013&mime_type=video_mp4&dy_q=1781675340。",
        )
        .await
        .expect("Qianchuan source video URL should preview");

        assert_eq!(candidates.len(), 1);
        assert_eq!(
            candidates[0].source_type,
            VideoLinkSourceType::QianchuanMaterialVideo
        );
        assert_eq!(candidates[0].external_item_id, None);
    }

    #[tokio::test]
    async fn previews_qianchuan_material_id_from_allowlisted_query_key() {
        let candidates = preview_video_links(
            "https://v6-adadmin.oceanengine.com/video/tos/cn/test.mp4?material_id=7650741360182509595&mime_type=video_mp4",
        )
        .await
        .expect("Qianchuan material id query should preview");

        assert_eq!(
            candidates[0].external_item_id.as_deref(),
            Some("7650741360182509595")
        );
    }

    #[tokio::test]
    async fn previews_qianchuan_material_id_from_nearby_text_keyword() {
        let candidates = preview_video_links(
            "千川素材ID7650741360182509595 https://v6-adadmin.oceanengine.com/video/tos/cn/test.mp4?mime_type=video_mp4",
        )
        .await
        .expect("Qianchuan material id nearby text should preview");

        assert_eq!(
            candidates[0].external_item_id.as_deref(),
            Some("7650741360182509595")
        );
    }

    #[tokio::test]
    async fn previews_multiple_supported_links_without_selecting_one_shape() {
        let candidates = preview_video_links(
            "抖音 https://www.douyin.com/video/7649697971252261370 千川素材ID7650741360182509595 https://v6-adadmin.oceanengine.com/video/tos/cn/test.mp4?mime_type=video_mp4",
        )
        .await
        .expect("multiple supported links should preview");

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].source_type, VideoLinkSourceType::DouyinVideo);
        assert_eq!(
            candidates[1].source_type,
            VideoLinkSourceType::QianchuanMaterialVideo
        );
    }

    #[tokio::test]
    async fn does_not_apply_distant_qianchuan_material_id_to_every_candidate() {
        let candidates = preview_video_links(
            "千川素材ID7650741360182509595 https://v6-adadmin.oceanengine.com/video/tos/cn/first.mp4?mime_type=video_mp4\n\n补充说明文字超过上下文窗口用于模拟多条素材粘贴，不应把第一条素材 ID 应用到后面的链接。这个段落用于隔离两个 URL，避免误把全局文本里的第一个 ID 当成所有候选的素材 ID。继续增加一些普通说明字符，确保距离超过一百二十个字符。\nhttps://v6-adadmin.oceanengine.com/video/tos/cn/second.mp4?mime_type=video_mp4",
        )
        .await
        .expect("multiple Qianchuan links should preview");

        assert_eq!(candidates.len(), 2);
        assert_eq!(
            candidates[0].external_item_id.as_deref(),
            Some("7650741360182509595")
        );
        assert_eq!(candidates[1].external_item_id, None);
    }

    #[tokio::test]
    async fn rejects_non_video_oceanengine_url() {
        let error = preview_video_links("https://v6-adadmin.oceanengine.com/not-video/page?x=1")
            .await
            .expect_err("non-video OceanEngine URL should not preview");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[tokio::test]
    async fn rejects_unallowlisted_oceanengine_host() {
        let error = preview_video_links(
            "https://evil.oceanengine.com/video/tos/cn/test.mp4?mime_type=video_mp4",
        )
        .await
        .expect_err("unallowlisted OceanEngine host should not preview");

        assert!(matches!(error, AppError::BadRequest(_)));
    }
}
