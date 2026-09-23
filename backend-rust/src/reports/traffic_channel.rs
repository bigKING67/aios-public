use super::GoodsChannelFunnelMetricItem;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TrafficChannelNature {
    Free,
    Paid,
    Mixed,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TrafficChannelProfile {
    Search,
    Recommend,
    KeywordAd,
    CrowdAd,
    SceneAd,
    FreeMixed,
    PaidMixed,
    Mixed,
    Unknown,
}

pub(super) fn classify_traffic_channel_profile(channel: &str) -> TrafficChannelProfile {
    let normalized = channel.trim().to_lowercase();
    if normalized.is_empty() {
        return TrafficChannelProfile::Unknown;
    }

    if normalized.contains("关键词") || normalized.contains("keyword") {
        return TrafficChannelProfile::KeywordAd;
    }
    if normalized.contains("人群") || normalized.contains("crowd") {
        return TrafficChannelProfile::CrowdAd;
    }
    if normalized.contains("场景") || normalized.contains("scene") {
        return TrafficChannelProfile::SceneAd;
    }
    if normalized.contains("推荐") || normalized.contains("recommend") {
        return TrafficChannelProfile::Recommend;
    }
    if normalized.contains("搜索") || normalized.contains("search") {
        return TrafficChannelProfile::Search;
    }

    TrafficChannelProfile::Unknown
}

pub(super) fn channel_profile_to_nature(profile: TrafficChannelProfile) -> TrafficChannelNature {
    match profile {
        TrafficChannelProfile::Search
        | TrafficChannelProfile::Recommend
        | TrafficChannelProfile::FreeMixed => TrafficChannelNature::Free,
        TrafficChannelProfile::KeywordAd
        | TrafficChannelProfile::CrowdAd
        | TrafficChannelProfile::SceneAd
        | TrafficChannelProfile::PaidMixed => TrafficChannelNature::Paid,
        TrafficChannelProfile::Mixed => TrafficChannelNature::Mixed,
        TrafficChannelProfile::Unknown => TrafficChannelNature::Unknown,
    }
}

pub(super) fn resolve_traffic_channel_profile(
    channel_items: &[GoodsChannelFunnelMetricItem],
    channel_context: &str,
) -> TrafficChannelProfile {
    #[derive(Default)]
    struct ProfileFlags {
        has_search: bool,
        has_recommend: bool,
        has_keyword_ad: bool,
        has_crowd_ad: bool,
        has_scene_ad: bool,
    }

    fn mark_profile(profile: TrafficChannelProfile, flags: &mut ProfileFlags) {
        match profile {
            TrafficChannelProfile::Search => flags.has_search = true,
            TrafficChannelProfile::Recommend => flags.has_recommend = true,
            TrafficChannelProfile::KeywordAd => flags.has_keyword_ad = true,
            TrafficChannelProfile::CrowdAd => flags.has_crowd_ad = true,
            TrafficChannelProfile::SceneAd => flags.has_scene_ad = true,
            TrafficChannelProfile::FreeMixed
            | TrafficChannelProfile::PaidMixed
            | TrafficChannelProfile::Mixed => {}
            TrafficChannelProfile::Unknown => {}
        }
    }

    fn resolve_from_flags(flags: &ProfileFlags) -> TrafficChannelProfile {
        let free_count = usize::from(flags.has_search) + usize::from(flags.has_recommend);
        let paid_count = usize::from(flags.has_keyword_ad)
            + usize::from(flags.has_crowd_ad)
            + usize::from(flags.has_scene_ad);

        if free_count == 0 && paid_count == 0 {
            return TrafficChannelProfile::Unknown;
        }
        if free_count > 0 && paid_count > 0 {
            return TrafficChannelProfile::Mixed;
        }
        if free_count > 1 {
            return TrafficChannelProfile::FreeMixed;
        }
        if paid_count > 1 {
            return TrafficChannelProfile::PaidMixed;
        }
        if flags.has_search {
            return TrafficChannelProfile::Search;
        }
        if flags.has_recommend {
            return TrafficChannelProfile::Recommend;
        }
        if flags.has_keyword_ad {
            return TrafficChannelProfile::KeywordAd;
        }
        if flags.has_crowd_ad {
            return TrafficChannelProfile::CrowdAd;
        }
        if flags.has_scene_ad {
            return TrafficChannelProfile::SceneAd;
        }

        TrafficChannelProfile::Unknown
    }

    let mut flags = ProfileFlags::default();

    for item in channel_items {
        mark_profile(
            classify_traffic_channel_profile(item.traffic_channel.as_str()),
            &mut flags,
        );
    }

    if resolve_from_flags(&flags) == TrafficChannelProfile::Unknown {
        for token in channel_context.split(['、', '，', ',', '/', '|', '+', ' ']) {
            if token.trim().is_empty() {
                continue;
            }
            mark_profile(classify_traffic_channel_profile(token), &mut flags);
        }
    }

    resolve_from_flags(&flags)
}
