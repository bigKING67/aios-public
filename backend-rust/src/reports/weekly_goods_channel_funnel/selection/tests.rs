use super::*;

#[test]
fn select_channels_prefers_positive_channels_above_baseline() {
    let contributions = vec![
        ChannelContribution {
            traffic_channel: "搜索".to_string(),
            gmv_delta: 120.0,
            contribution_rate: 42.0,
        },
        ChannelContribution {
            traffic_channel: "推荐".to_string(),
            gmv_delta: 60.0,
            contribution_rate: 18.0,
        },
        ChannelContribution {
            traffic_channel: "场景".to_string(),
            gmv_delta: -10.0,
            contribution_rate: 8.0,
        },
    ];

    let selected = select_channels(&contributions, Some(15.0));
    assert_eq!(selected, vec!["搜索".to_string(), "推荐".to_string()]);
}

#[test]
fn select_channels_falls_back_to_top_positive_or_top_two() {
    let contributions = vec![
        ChannelContribution {
            traffic_channel: "A".to_string(),
            gmv_delta: 10.0,
            contribution_rate: 12.0,
        },
        ChannelContribution {
            traffic_channel: "B".to_string(),
            gmv_delta: 8.0,
            contribution_rate: 10.0,
        },
        ChannelContribution {
            traffic_channel: "C".to_string(),
            gmv_delta: -2.0,
            contribution_rate: 30.0,
        },
    ];

    let selected = select_channels(&contributions, Some(50.0));
    assert_eq!(selected, vec!["A".to_string(), "B".to_string()]);
}
