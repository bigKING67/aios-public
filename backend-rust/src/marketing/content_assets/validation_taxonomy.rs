use crate::error::{AppError, AppResult};

use super::validation_text::normalize_optional_text;

const VIDEO_TYPE_KOL_SEEDING: &str = "kol_seeding_video";
const VIDEO_TYPE_KOC_SEEDING: &str = "koc_seeding_video";
const VIDEO_TYPE_KOC_SHOPPABLE: &str = "koc_shoppable_video";
const VIDEO_TYPE_STORE_LIVE: &str = "store_live_video";
const PRODUCT_REVIVAL_SERUM: &str = "焕活精华（绿瓶）";
const PRODUCT_REVIVAL_SERUM_LEGACY_TYPO: &str = "唤活精华（绿瓶）";
const PRODUCT_PLATINUM_SERUM_60ML: &str = "白金精华（白瓶60ml）";
const PRODUCT_HAIRLINE_SERUM_20ML: &str = "发际线精华（20ml）";
const PRODUCT_SHAMPOO_OILY: &str = "洗发水（油头）";
const PRODUCT_SHAMPOO_DRY: &str = "洗发水（干头）";
const ORIGIN_VOLUME_SUBTYPES: &[&str] = &["发缝宽", "发量稀疏", "头顶扁塌"];
const ORIGIN_HAIRLINE_SUBTYPES: &[&str] = &["发际线后移", "山羊角"];
const ORIGIN_SCALP_SUBTYPES: &[&str] = &[
    "额头纹路",
    "眉眼松弛",
    "面部轮廓松弛",
    "油头扁塌",
    "敏感泛红",
    "防脱初尝者",
    "干枯受损党",
];
const ORIGIN_BEAUTY_SUBTYPES: &[&str] = &["职场/熬夜压力", "细软塌", "发缝/发际线焦虑"];
const EXTENSION_PREGNANCY_SUBTYPES: &[&str] = &[
    "产前预防",
    "产中维稳",
    "产后修护",
    "产后脱发修护",
    "哺乳期安全养护",
];
const ASSOCIATION_DIRECTIONAL_SUBTYPES: &[&str] = &[
    "重度脱发",
    "植发犹豫",
    "成分进阶",
    "医美替代",
    "男性脱发",
    "头面部抗衰",
];

pub(super) fn normalize_product_display_name(
    product_name: Option<String>,
    product_names: &[String],
) -> Option<String> {
    if !product_names.is_empty() {
        return Some(product_names.join(" / "));
    }
    normalize_product_name(product_name)
}

pub(super) fn normalize_product_name_list(values: Option<Vec<String>>) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values.unwrap_or_default() {
        let Some(item) = normalize_product_name(Some(value)) else {
            continue;
        };
        if normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&item))
        {
            continue;
        }
        normalized.push(item);
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

pub(super) fn normalize_product_name(value: Option<String>) -> Option<String> {
    let value = normalize_optional_text(value, 120)?;
    match value.as_str() {
        PRODUCT_REVIVAL_SERUM | PRODUCT_REVIVAL_SERUM_LEGACY_TYPO | "小绿瓶" => {
            Some(PRODUCT_REVIVAL_SERUM.to_string())
        }
        PRODUCT_PLATINUM_SERUM_60ML | "白金发际线60ml" => {
            Some(PRODUCT_PLATINUM_SERUM_60ML.to_string())
        }
        PRODUCT_HAIRLINE_SERUM_20ML | "白金发际线20ml" => {
            Some(PRODUCT_HAIRLINE_SERUM_20ML.to_string())
        }
        PRODUCT_SHAMPOO_OILY => Some(PRODUCT_SHAMPOO_OILY.to_string()),
        PRODUCT_SHAMPOO_DRY => Some(PRODUCT_SHAMPOO_DRY.to_string()),
        // The legacy generic shampoo value cannot be mapped to oily/dry reliably.
        "洗发水" => None,
        _ => None,
    }
}

pub(super) fn normalize_video_type(value: Option<String>) -> Option<String> {
    let value = normalize_optional_text(value, 80)?;
    let compact = value
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '-' && *ch != '_')
        .collect::<String>()
        .to_lowercase();
    match compact.as_str() {
        "kol种草视频" | "kolseedingvideo" | "kolseeding" => {
            Some(VIDEO_TYPE_KOL_SEEDING.to_string())
        }
        "koc种草" | "koc种草视频" | "kocseedingvideo" | "kocseeding" => {
            Some(VIDEO_TYPE_KOC_SEEDING.to_string())
        }
        "koc挂车视频" | "kocshoppablevideo" | "kocshoppable" => {
            Some(VIDEO_TYPE_KOC_SHOPPABLE.to_string())
        }
        "店播视频" | "storelivevideo" | "storelive" => Some(VIDEO_TYPE_STORE_LIVE.to_string()),
        _ => None,
    }
}

pub(super) fn normalize_content_scene_group(value: Option<String>) -> Option<String> {
    let value = normalize_optional_text(value, 120)?;
    match value.as_str() {
        "发量→脸型" => Some("发量".to_string()),
        "发际线→年轻感" => Some("发际线".to_string()),
        "头皮→面部紧致" => Some("头皮".to_string()),
        _ => Some(value),
    }
}

pub(super) fn normalize_content_scene_fields(
    video_type: Option<&str>,
    content_scene: Option<String>,
    content_scene_group: Option<String>,
    content_scene_subtype: Option<String>,
) -> AppResult<(Option<String>, Option<String>, Option<String>)> {
    if !is_scene_enabled_video_type(video_type) {
        return Ok((None, None, None));
    }

    let scene = normalize_optional_text(content_scene, 120);
    let scene_group = normalize_content_scene_group(content_scene_group);
    let scene_subtype = normalize_optional_text(content_scene_subtype, 120);
    validate_content_scene_taxonomy(
        scene.as_deref(),
        scene_group.as_deref(),
        scene_subtype.as_deref(),
    )?;
    Ok((scene, scene_group, scene_subtype))
}

fn is_scene_enabled_video_type(video_type: Option<&str>) -> bool {
    matches!(
        video_type,
        Some(value) if value == VIDEO_TYPE_KOL_SEEDING
            || value == VIDEO_TYPE_KOC_SEEDING
            || value == VIDEO_TYPE_KOC_SHOPPABLE
            || value == VIDEO_TYPE_STORE_LIVE
    )
}

fn validate_content_scene_taxonomy(
    scene: Option<&str>,
    scene_group: Option<&str>,
    scene_subtype: Option<&str>,
) -> AppResult<()> {
    let Some(scene) = scene else {
        if scene_group.is_some() || scene_subtype.is_some() {
            return Err(AppError::bad_request(
                "填写大场景或细分场景前需要先选择场景类型",
            ));
        }
        return Ok(());
    };

    match scene {
        "原点场景" => validate_origin_scene_group(scene_group, scene_subtype),
        "拓展场景" => validate_grouped_scene(
            scene_group,
            scene_subtype,
            &[("孕期", EXTENSION_PREGNANCY_SUBTYPES)],
            "拓展场景大场景必须是 孕期",
        ),
        "联想场景" => validate_grouped_scene(
            scene_group,
            scene_subtype,
            &[("定向", ASSOCIATION_DIRECTIONAL_SUBTYPES)],
            "联想场景大场景必须是 定向",
        ),
        "通用场景" => validate_common_scene_group(scene_group, scene_subtype),
        _ => Err(AppError::bad_request(
            "场景类型必须是 原点场景 / 拓展场景 / 联想场景 / 通用场景",
        )),
    }
}

fn validate_origin_scene_group(
    scene_group: Option<&str>,
    scene_subtype: Option<&str>,
) -> AppResult<()> {
    let Some(scene_group) = scene_group else {
        if scene_subtype.is_some() {
            return Err(AppError::bad_request("填写细分场景前需要先选择大场景"));
        }
        return Ok(());
    };

    let allowed_subtypes = match scene_group {
        "发量" => ORIGIN_VOLUME_SUBTYPES,
        "发际线" => ORIGIN_HAIRLINE_SUBTYPES,
        "头皮" => ORIGIN_SCALP_SUBTYPES,
        "变美" => ORIGIN_BEAUTY_SUBTYPES,
        _ => {
            return Err(AppError::bad_request(
                "原点场景大场景必须是 发量 / 发际线 / 头皮 / 变美",
            ));
        }
    };

    validate_scene_subtype(allowed_subtypes, scene_subtype)
}

fn validate_grouped_scene(
    scene_group: Option<&str>,
    scene_subtype: Option<&str>,
    groups: &[(&str, &[&str])],
    invalid_group_message: &'static str,
) -> AppResult<()> {
    let Some(scene_group) = scene_group else {
        if scene_subtype.is_some() {
            return Err(AppError::bad_request("填写细分场景前需要先选择大场景"));
        }
        return Ok(());
    };

    let Some((_, allowed_subtypes)) = groups.iter().find(|(group, _)| *group == scene_group) else {
        return Err(AppError::bad_request(invalid_group_message));
    };

    validate_scene_subtype(allowed_subtypes, scene_subtype)
}

fn validate_scene_subtype(allowed_subtypes: &[&str], scene_subtype: Option<&str>) -> AppResult<()> {
    if let Some(scene_subtype) = scene_subtype {
        if !allowed_subtypes.contains(&scene_subtype) {
            return Err(AppError::bad_request("细分场景与大场景不匹配"));
        }
    }
    Ok(())
}

fn validate_common_scene_group(
    scene_group: Option<&str>,
    scene_subtype: Option<&str>,
) -> AppResult<()> {
    if scene_subtype.is_some() {
        return Err(AppError::bad_request("通用场景暂不支持细分场景"));
    }
    if let Some(scene_group) = scene_group {
        if !["机制", "品牌"].contains(&scene_group) {
            return Err(AppError::bad_request("通用场景大场景必须是 机制 / 品牌"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_content_scene_fields, normalize_product_name, normalize_video_type,
        PRODUCT_HAIRLINE_SERUM_20ML, PRODUCT_PLATINUM_SERUM_60ML, PRODUCT_REVIVAL_SERUM,
        PRODUCT_SHAMPOO_DRY, PRODUCT_SHAMPOO_OILY, VIDEO_TYPE_KOC_SEEDING,
        VIDEO_TYPE_KOC_SHOPPABLE, VIDEO_TYPE_KOL_SEEDING, VIDEO_TYPE_STORE_LIVE,
    };

    #[test]
    fn normalizes_video_type_aliases_to_canonical_code() {
        assert_eq!(
            normalize_video_type(Some(" KOL 种草视频 ".to_string())).as_deref(),
            Some("kol_seeding_video")
        );
        assert_eq!(
            normalize_video_type(Some("KOC种草视频".to_string())).as_deref(),
            Some("koc_seeding_video")
        );
        assert_eq!(
            normalize_video_type(Some("KOC挂车视频".to_string())).as_deref(),
            Some("koc_shoppable_video")
        );
        assert_eq!(
            normalize_video_type(Some("store live video".to_string())).as_deref(),
            Some("store_live_video")
        );
    }

    #[test]
    fn normalizes_legacy_product_aliases_to_current_options() {
        assert_eq!(
            normalize_product_name(Some(" 小绿瓶 ".to_string())).as_deref(),
            Some(PRODUCT_REVIVAL_SERUM)
        );
        assert_eq!(
            normalize_product_name(Some("唤活精华（绿瓶）".to_string())).as_deref(),
            Some(PRODUCT_REVIVAL_SERUM)
        );
        assert_eq!(
            normalize_product_name(Some("白金发际线20ml".to_string())).as_deref(),
            Some(PRODUCT_HAIRLINE_SERUM_20ML)
        );
        assert_eq!(
            normalize_product_name(Some("白金发际线60ml".to_string())).as_deref(),
            Some(PRODUCT_PLATINUM_SERUM_60ML)
        );
        assert_eq!(
            normalize_product_name(Some("洗发水（油头）".to_string())).as_deref(),
            Some(PRODUCT_SHAMPOO_OILY)
        );
        assert_eq!(
            normalize_product_name(Some("洗发水（干头）".to_string())).as_deref(),
            Some(PRODUCT_SHAMPOO_DRY)
        );
        assert!(normalize_product_name(Some("洗发水".to_string())).is_none());
        assert!(normalize_product_name(Some("旧产品".to_string())).is_none());
    }

    #[test]
    fn keeps_scene_fields_for_configured_scene_video_types() {
        let (scene, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some(" 原点场景 ".to_string()),
            Some(" 发量 ".to_string()),
            Some(" 发缝宽 ".to_string()),
        )
        .expect("KOL scene fields should be valid");

        assert_eq!(scene.as_deref(), Some("原点场景"));
        assert_eq!(scene_group.as_deref(), Some("发量"));
        assert_eq!(scene_subtype.as_deref(), Some("发缝宽"));

        let (scene, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOC_SEEDING),
            Some(" 原点场景 ".to_string()),
            Some(" 变美 ".to_string()),
            Some(" 发缝/发际线焦虑 ".to_string()),
        )
        .expect("KOC seeding scene fields should be valid");

        assert_eq!(scene.as_deref(), Some("原点场景"));
        assert_eq!(scene_group.as_deref(), Some("变美"));
        assert_eq!(scene_subtype.as_deref(), Some("发缝/发际线焦虑"));

        let (scene, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_STORE_LIVE),
            Some("拓展场景".to_string()),
            Some("孕期".to_string()),
            Some("产中维稳".to_string()),
        )
        .expect("store-live scenes should be valid");

        assert_eq!(scene.as_deref(), Some("拓展场景"));
        assert_eq!(scene_group.as_deref(), Some("孕期"));
        assert_eq!(scene_subtype.as_deref(), Some("产中维稳"));
    }

    #[test]
    fn accepts_current_product_scene_taxonomy_and_legacy_origin_paths() {
        let (_, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("原点场景".to_string()),
            Some("头皮".to_string()),
            Some("油头扁塌".to_string()),
        )
        .expect("current shampoo origin scene should be valid");
        assert_eq!(scene_group.as_deref(), Some("头皮"));
        assert_eq!(scene_subtype.as_deref(), Some("油头扁塌"));

        let (_, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOC_SHOPPABLE),
            Some("原点场景".to_string()),
            Some("头皮".to_string()),
            Some("面部轮廓松弛".to_string()),
        )
        .expect("legacy origin scene should remain valid");
        assert_eq!(scene_group.as_deref(), Some("头皮"));
        assert_eq!(scene_subtype.as_deref(), Some("面部轮廓松弛"));

        let (_, scene_group, scene_subtype) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("联想场景".to_string()),
            Some("定向".to_string()),
            Some("头面部抗衰".to_string()),
        )
        .expect("current association scene should be valid");
        assert_eq!(scene_group.as_deref(), Some("定向"));
        assert_eq!(scene_subtype.as_deref(), Some("头面部抗衰"));
    }

    #[test]
    fn normalizes_legacy_scene_group_aliases_to_current_taxonomy() {
        let (_, scene_group, _) = normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("原点场景".to_string()),
            Some("发际线→年轻感".to_string()),
            Some("山羊角".to_string()),
        )
        .expect("legacy scene group aliases should remain accepted");

        assert_eq!(scene_group.as_deref(), Some("发际线"));
    }

    #[test]
    fn rejects_invalid_scene_taxonomy_for_scene_enabled_video_types() {
        assert!(normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("原点场景".to_string()),
            Some("机制".to_string()),
            None,
        )
        .is_err());

        assert!(normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOC_SHOPPABLE),
            Some("原点场景".to_string()),
            Some("发量".to_string()),
            Some("山羊角".to_string()),
        )
        .is_err());

        assert!(normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("通用场景".to_string()),
            Some("机制".to_string()),
            Some("发缝宽".to_string()),
        )
        .is_err());

        assert!(normalize_content_scene_fields(
            Some(VIDEO_TYPE_STORE_LIVE),
            Some("拓展场景".to_string()),
            Some("机制".to_string()),
            None,
        )
        .is_err());

        assert!(normalize_content_scene_fields(
            Some(VIDEO_TYPE_KOL_SEEDING),
            Some("联想场景".to_string()),
            Some("定向".to_string()),
            Some("产后修护".to_string()),
        )
        .is_err());
    }

    #[test]
    fn drops_unknown_video_type_values() {
        assert!(normalize_video_type(Some("其他视频".to_string())).is_none());
    }
}
