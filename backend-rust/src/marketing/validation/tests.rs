use super::{
    normalize_anchor_level_label, normalize_follow_log_payload, normalize_payload, normalize_query,
};
use crate::marketing::types::{
    CreatorLibraryFollowLogPayload, CreatorLibraryPayload, CreatorLibraryQuery, CreatorLibrarySort,
};

#[test]
fn defaults_creator_library_sort_to_owner_priority() {
    let normalized = normalize_query(CreatorLibraryQuery {
        sort: None,
        ..Default::default()
    })
    .expect("query should normalize");

    assert_eq!(normalized.sort, CreatorLibrarySort::OwnerPriorityDesc);
}

#[test]
fn accepts_explicit_creator_library_updated_sort() {
    let normalized = normalize_query(CreatorLibraryQuery {
        sort: Some("updated_at_desc".to_string()),
        ..Default::default()
    })
    .expect("query should normalize");

    assert_eq!(normalized.sort, CreatorLibrarySort::UpdatedDesc);
}

#[test]
fn normalizes_anchor_level_aliases_to_canonical_labels() {
    let cases = [
        ("S-超头部", "S-超头部"),
        ("S（超头）", "S-超头部"),
        ("S", "S-超头部"),
        ("超头部", "S-超头部"),
        ("A-头部", "A-头部"),
        ("A（头部）", "A-头部"),
        ("A", "A-头部"),
        ("头部", "A-头部"),
        ("B-肩部", "B-肩部"),
        ("B", "B-肩部"),
        ("肩部", "B-肩部"),
        ("B（中腰部）", "C-中腰部"),
        ("C-中腰部", "C-中腰部"),
        ("中腰部", "C-中腰部"),
        ("C（尾部）", "D-尾部"),
        ("D-尾部", "D-尾部"),
        ("D", "D-尾部"),
        ("尾部", "D-尾部"),
    ];

    for (input, expected) in cases {
        assert_eq!(
            normalize_anchor_level_label(input).as_deref(),
            Some(expected)
        );
    }
}

#[test]
fn normalizes_payload_cooperation_status_aliases() {
    let cases = [
        ("建联", "初期建联", true),
        ("寄样", "试样洽谈", true),
        ("不考虑", "暂不考虑合作", true),
        ("暂停", "合作暂停", true),
        ("开播", "已合作", true),
        ("拉黑", "黑名单", true),
        ("x不合作", "❌不合作", false),
    ];

    for (input, expected_status, expected_cooperable) in cases {
        let normalized = normalize_payload(CreatorLibraryPayload {
            platform: "抖音".to_string(),
            influencer_name: "测试达人".to_string(),
            influencer_id: None,
            douyin_handle: None,
            phone: None,
            mcn: None,
            category: None,
            anchor_desc: None,
            anchor_level: None,
            main_platform_fans: None,
            sales_30d: None,
            sales_90d: None,
            tags: None,
            cooperation_status: Some(input.to_string()),
            cooperation_desc: None,
            owner_name: None,
            owner_user_id: None,
            is_cooperable: None,
            last_followed_at: None,
            follow_note: None,
            expected_updated_at: None,
            updated_at: None,
        })
        .expect("payload should normalize");

        assert_eq!(
            normalized.cooperation_status.as_deref(),
            Some(expected_status)
        );
        assert_eq!(normalized.cooperation_status_norm, expected_status);
        assert_eq!(normalized.is_cooperable, expected_cooperable);
    }
}

#[test]
fn preserves_expected_updated_at_for_optimistic_locking() {
    let input = normalize_payload(CreatorLibraryPayload {
        platform: "抖音".to_string(),
        influencer_name: "测试达人".to_string(),
        influencer_id: None,
        douyin_handle: None,
        phone: None,
        mcn: None,
        category: None,
        anchor_desc: None,
        anchor_level: None,
        main_platform_fans: None,
        sales_30d: None,
        sales_90d: None,
        tags: None,
        cooperation_status: None,
        cooperation_desc: None,
        owner_name: None,
        owner_user_id: None,
        is_cooperable: None,
        last_followed_at: None,
        follow_note: None,
        expected_updated_at: Some("2026-05-10 12:34:56.123456".to_string()),
        updated_at: None,
    })
    .expect("payload should normalize");

    assert_eq!(
        input.expected_updated_at.as_deref(),
        Some("2026-05-10 12:34:56.123456")
    );
}

#[test]
fn accepts_legacy_updated_at_as_optimistic_lock_token() {
    let input = normalize_payload(CreatorLibraryPayload {
        platform: "抖音".to_string(),
        influencer_name: "测试达人".to_string(),
        influencer_id: None,
        douyin_handle: None,
        phone: None,
        mcn: None,
        category: None,
        anchor_desc: None,
        anchor_level: None,
        main_platform_fans: None,
        sales_30d: None,
        sales_90d: None,
        tags: None,
        cooperation_status: None,
        cooperation_desc: None,
        owner_name: None,
        owner_user_id: None,
        is_cooperable: None,
        last_followed_at: None,
        follow_note: None,
        expected_updated_at: None,
        updated_at: Some("2026-05-10 12:34:56.123456".to_string()),
    })
    .expect("payload should normalize");

    assert_eq!(
        input.expected_updated_at.as_deref(),
        Some("2026-05-10 12:34:56.123456")
    );
}

#[test]
fn normalizes_follow_log_expected_updated_at() {
    let input = normalize_follow_log_payload(CreatorLibraryFollowLogPayload {
        follow_note: Some("已沟通报价".to_string()),
        expected_updated_at: Some("2026-05-10 13:00:00.123456".to_string()),
        updated_at: None,
    })
    .expect("follow log payload should normalize");

    assert_eq!(input.follow_note, "已沟通报价");
    assert_eq!(
        input.expected_updated_at.as_deref(),
        Some("2026-05-10 13:00:00.123456")
    );
}

#[test]
fn accepts_legacy_follow_log_updated_at_as_lock_token() {
    let input = normalize_follow_log_payload(CreatorLibraryFollowLogPayload {
        follow_note: Some("继续寄样".to_string()),
        expected_updated_at: None,
        updated_at: Some("2026-05-10 14:00:00.654321".to_string()),
    })
    .expect("follow log payload should normalize");

    assert_eq!(
        input.expected_updated_at.as_deref(),
        Some("2026-05-10 14:00:00.654321")
    );
}
