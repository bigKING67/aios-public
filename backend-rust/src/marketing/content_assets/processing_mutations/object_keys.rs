use crate::error::{AppError, AppResult};

pub(super) fn derive_output_key(raw_object_key: &str, folder: &str, file_ext: &str) -> String {
    let (directory, file_name) = raw_object_key
        .rsplit_once('/')
        .unwrap_or(("", raw_object_key));
    let stem = file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);
    let relative_directory = directory.strip_prefix("raw/").unwrap_or(directory);
    if relative_directory.is_empty() {
        format!("{folder}/{stem}.{file_ext}")
    } else {
        format!("{folder}/{relative_directory}/{stem}.{file_ext}")
    }
}

pub(super) fn resolve_analysis_input_key(
    source: &str,
    raw_object_key: Option<&str>,
    preview_object_key: Option<&str>,
) -> AppResult<String> {
    let raw_object_key = raw_object_key.filter(|value| !value.trim().is_empty());
    let preview_object_key = preview_object_key.filter(|value| !value.trim().is_empty());

    match source {
        "preview" => preview_object_key
            .map(ToString::to_string)
            .ok_or_else(|| AppError::bad_request("缺少 preview_object_key，无法创建快速分析任务")),
        "raw" => raw_object_key
            .map(ToString::to_string)
            .ok_or_else(|| AppError::bad_request("缺少 raw_object_key，无法创建原片完整分析任务")),
        "auto" => preview_object_key
            .or(raw_object_key)
            .map(ToString::to_string)
            .ok_or_else(|| AppError::bad_request("缺少可分析的视频对象")),
        _ => Err(AppError::bad_request("AI 分析来源不合法")),
    }
}

pub(super) fn resolve_transcript_input_key(
    source: &str,
    raw_object_key: Option<&str>,
    preview_object_key: Option<&str>,
) -> AppResult<String> {
    let raw_object_key = raw_object_key.filter(|value| !value.trim().is_empty());
    let preview_object_key = preview_object_key.filter(|value| !value.trim().is_empty());

    match source {
        "raw" => raw_object_key
            .map(ToString::to_string)
            .ok_or_else(|| AppError::bad_request("缺少 raw_object_key，无法创建原片脚本/SRT 任务")),
        "preview" => preview_object_key.map(ToString::to_string).ok_or_else(|| {
            AppError::bad_request("缺少 preview_object_key，无法创建预览脚本/SRT 任务")
        }),
        "auto" => raw_object_key
            .or(preview_object_key)
            .map(ToString::to_string)
            .ok_or_else(|| AppError::bad_request("缺少可转写的视频对象")),
        _ => Err(AppError::bad_request("脚本抽取来源不合法")),
    }
}

pub(super) fn resolve_analysis_input_role(
    input_object_key: &str,
    raw_object_key: Option<&str>,
    preview_object_key: Option<&str>,
) -> String {
    if preview_object_key
        .filter(|value| !value.trim().is_empty())
        .is_some_and(|value| value == input_object_key)
    {
        return "preview".to_string();
    }
    if raw_object_key
        .filter(|value| !value.trim().is_empty())
        .is_some_and(|value| value == input_object_key)
    {
        return "raw".to_string();
    }
    "preview".to_string()
}

pub(super) fn default_analysis_profile(input_role: &str) -> &'static str {
    match input_role {
        "raw" => "raw_deep",
        "preview" => "preview_fast",
        _ => "preview_fast",
    }
}
