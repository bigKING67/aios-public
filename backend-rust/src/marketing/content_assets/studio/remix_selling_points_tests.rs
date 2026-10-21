//! Unit tests of `remix_selling_points` (类型 2 卖点混剪 pure logic).
use super::*;

const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

pub(super) fn frame(n: u128, asset: u128, label: &str, start: i32, end: i32) -> FrameSegment {
    FrameSegment {
        segment_id: Uuid::from_u128(n),
        asset_id: Uuid::from_u128(asset),
        start_ms: start,
        end_ms: end,
        label_key: label.into(),
        source_content_hash: HASH.into(),
    }
}

pub(super) fn point(
    n: u128,
    asset: u128,
    label: &str,
    start: i32,
    end: i32,
    joins: bool,
) -> PointSegment {
    PointSegment {
        segment_id: Uuid::from_u128(n),
        asset_id: Uuid::from_u128(asset),
        start_ms: start,
        end_ms: end,
        label_key: label.into(),
        additional_label_keys: Vec::new(),
        continues_previous: joins,
    }
}

pub(super) fn all_blocks(frames: &[FrameSegment], points: &[PointSegment]) -> Vec<Block> {
    build_blocks(frames, points)
        .into_values()
        .flatten()
        .collect()
}

#[test]
fn one_span_covers_both_required_points_and_renders_only_once() {
    let reference = vec![frame(1, 10, "mixed_voiceover", 0, 10_000)];
    let candidates = vec![frame(2, 20, "mixed_voiceover", 0, 10_000)];
    let mut source = point(11, 10, "moisturizing", 0, 8500, false);
    source.additional_label_keys = vec!["skincare".into()];
    let mut candidate = point(21, 20, "skincare", 0, 8500, false);
    candidate.additional_label_keys = vec!["moisturizing".into()];
    let slots = reference_slots(&reference, &build_blocks(&reference, &[source]));
    let blocks = all_blocks(&candidates, &[candidate]);
    let options = vec![slot_options(&slots[0], &candidates, &blocks, false, 1)];
    assert_eq!(options[0].len(), 1);
    assert_eq!(options[0][0].tier, Tier::Exact);
    assert_eq!(
        options[0][0].clips[0].selling_points,
        ["moisturizing", "skincare"]
    );
    assert_eq!(options[0][0].clips[0].segment_ids, [Uuid::from_u128(21)]);
    assert_eq!(
        select(
            &options,
            1,
            1,
            &limits(&slots, 60_000),
            &HashSet::new(),
            &reference_hash(&slots)
        )
        .combos
        .len(),
        1
    );
}

#[test]
fn star_and_kol_swap_as_exact_but_expert_does_not_even_in_varied_or_fallback() {
    let refs = vec![frame(1, 10, "mixed_voiceover", 0, 10_000)];
    let frames = vec![
        frame(2, 20, "mixed_voiceover", 0, 10_000),
        frame(3, 30, "mixed_voiceover", 0, 10_000),
    ];
    let mut source = point(11, 10, "star_endorsement", 0, 8500, false);
    source.additional_label_keys = vec!["moisturizing".into(), "skincare".into()];
    let mut kol = point(21, 20, "kol_endorsement", 0, 8500, false);
    kol.additional_label_keys = source.additional_label_keys.clone();
    let mut expert = point(31, 30, "expert_endorsement", 0, 8500, false);
    expert.additional_label_keys = source.additional_label_keys.clone();
    let mut slot = reference_slots(&refs, &build_blocks(&refs, &[source])).remove(0);
    let blocks = all_blocks(&frames, &[kol, expert]);
    for fallback in [false, true] {
        slot.fallback = fallback;
        let options = slot_options(&slot, &frames, &blocks, true, 1);
        assert_eq!(options.len(), 1);
        assert_eq!(options[0].tier, Tier::Exact);
        assert_eq!(options[0].clips[0].asset_id, Uuid::from_u128(20));
        assert!(options[0].clips[0]
            .selling_points
            .contains(&"kol_endorsement".into()));
    }
}

#[test]
fn star_and_kol_share_reference_repeat_budget_across_slots() {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 10_000),
        frame(2, 20, "mixed_voiceover", 0, 10_000),
    ];
    let mut star = point(11, 10, "star_endorsement", 0, 8500, false);
    star.additional_label_keys = vec!["moisturizing".into(), "skincare".into()];
    let kol = point(21, 20, "kol_endorsement", 0, 8500, false);
    let blocks = all_blocks(&frames, &[star, kol]);
    let options: Vec<_> = blocks
        .iter()
        .map(|block| {
            vec![SlotOption {
                clips: vec![block_clip(block)],
                tier: Tier::Exact,
                fallback: false,
            }]
        })
        .collect();
    let mut budget = Limits {
        max_total_ms: 60_000,
        max_sources: 3,
        allowance: HashMap::from([("public_endorsement".into(), 1)]),
    };
    assert!(matches!(
        evaluate(&options, vec![0, 0], &budget, &HashSet::new(), ""),
        Verdict::Invalid
    ));
    budget.allowance.insert("public_endorsement".into(), 2);
    assert!(matches!(
        evaluate(&options, vec![0, 0], &budget, &HashSet::new(), ""),
        Verdict::Valid(_)
    ));
}

#[test]
fn blocks_follow_continuity_and_never_cross_framework_segments() {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 30_000),
        frame(2, 10, "mixed_voiceover", 30_000, 40_000),
        frame(3, 10, "street_interview", 40_000, 50_000),
    ];
    let points = vec![
        point(11, 10, "moisturizing", 0, 8_000, false),
        point(12, 10, "long_wear", 8_000, 16_000, true),
        point(13, 10, "no_caking", 16_500, 25_000, false),
        // Marked continuous, but the framework segment changes: new block.
        point(14, 10, "skincare", 30_000, 36_000, true),
        // Selling points are only split inside 混剪口播.
        point(15, 10, "moisturizing", 41_000, 48_000, false),
    ];
    let blocks = build_blocks(&frames, &points);
    let first: Vec<Vec<String>> = blocks[&0].iter().map(Block::selling_points).collect();
    assert_eq!(
        first,
        vec![
            vec!["moisturizing".to_string(), "long_wear".into()],
            vec!["no_caking".into()]
        ]
    );
    assert_eq!(blocks[&1].len(), 1);
    assert_eq!(blocks[&1][0].points[0].segment_id, Uuid::from_u128(14));
    assert!(!blocks.contains_key(&2));
}

/// Reference: mixed_voiceover 0–24 s with 滋润→养肤 continuous (20 s, below the
/// long-chain share), then promotion 24–34 s without selling points.
fn reference() -> (Vec<FrameSegment>, Vec<RefSlot>) {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 24_000),
        frame(2, 10, "promotion", 24_000, 34_000),
    ];
    let points = vec![
        point(11, 10, "moisturizing", 0, 10_000, false),
        point(12, 10, "skincare", 10_000, 20_000, true),
    ];
    let slots = reference_slots(&frames, &build_blocks(&frames, &points));
    (frames, slots)
}

#[test]
fn reference_slots_target_blocks_and_fall_back_without_points_or_on_long_chains() {
    let (_, slots) = reference();
    assert!(!slots[0].fallback);
    assert_eq!(
        slots[0].target,
        vec!["moisturizing".to_string(), "skincare".into()]
    );
    assert_eq!(
        slots[0].reference_ids,
        vec![Uuid::from_u128(11), Uuid::from_u128(12)]
    );
    assert!(slots[1].fallback, "promotion has no selling points");
    assert_eq!(slots[1].reference_ids, vec![Uuid::from_u128(2)]);
    // One continuous chain covering the whole segment is a long chain.
    let frames = vec![frame(1, 10, "mixed_voiceover", 0, 20_000)];
    let points = vec![
        point(11, 10, "moisturizing", 0, 10_000, false),
        point(12, 10, "long_wear", 10_000, 19_000, true),
    ];
    assert!(reference_slots(&frames, &build_blocks(&frames, &points))[0].fallback);
}

/// Material of other assets for the mixed_voiceover slot (target 滋润 → 养肤, 24 s ± 20 %).
fn material() -> (Vec<FrameSegment>, Vec<PointSegment>) {
    let frames = vec![
        frame(101, 20, "mixed_voiceover", 0, 40_000),
        frame(102, 30, "mixed_voiceover", 0, 40_000),
        frame(103, 40, "mixed_voiceover", 0, 40_000),
        frame(104, 50, "promotion", 0, 9_000),
    ];
    let points = vec![
        // asset 20: exact continuous block 滋润→养肤 (20 s).
        point(201, 20, "moisturizing", 0, 10_000, false),
        point(202, 20, "skincare", 10_000, 20_000, true),
        // asset 30: 滋润 and 养肤 as separate blocks (10 s + 11 s).
        point(301, 30, "moisturizing", 0, 10_000, false),
        point(302, 30, "skincare", 20_000, 31_000, false),
        // asset 40: 养肤→滋润 continuous (reordered) (varied, 20 s).
        point(401, 40, "skincare", 0, 10_000, false),
        point(402, 40, "moisturizing", 10_000, 20_000, true),
    ];
    (frames, points)
}

#[test]
fn slot_options_are_tiered_and_respect_tolerance_and_variation_switch() {
    let (_, slots) = reference();
    let (frames, points) = material();
    let blocks = all_blocks(&frames, &points);
    let options = slot_options(&slots[0], &frames, &blocks, true, 7);
    let tiers: Vec<(Tier, Vec<Uuid>)> = options
        .iter()
        .map(|o| (o.tier, o.segment_ids().collect()))
        .collect();
    assert!(tiers.contains(&(
        Tier::Exact,
        vec![Uuid::from_u128(201), Uuid::from_u128(202)]
    )));
    assert!(tiers.contains(&(
        Tier::Spliced,
        vec![Uuid::from_u128(301), Uuid::from_u128(302)]
    )));
    assert!(tiers.contains(&(
        Tier::Varied,
        vec![Uuid::from_u128(401), Uuid::from_u128(402)]
    )));
    assert!(options.iter().all(|o| distinct(o.selling_points())));
    let strict = slot_options(&slots[0], &frames, &blocks, false, 7);
    assert!(strict.iter().all(|o| o.tier != Tier::Varied));
    // A 30 s target makes the 20–21 s fills fall outside ±20 %.
    let mut long = slots[0].clone();
    long.duration_ms = 30_000;
    assert!(slot_options(&long, &frames, &blocks, true, 7).is_empty());
}

#[test]
fn fallback_slots_use_whole_framework_segments() {
    let (_, slots) = reference();
    let (frames, points) = material();
    let options = slot_options(&slots[1], &frames, &all_blocks(&frames, &points), true, 7);
    assert_eq!(options.len(), 1);
    assert!(options[0].fallback);
    assert_eq!(options[0].clips[0].segment_ids, vec![Uuid::from_u128(104)]);
}

#[test]
fn fallback_slots_enforce_the_same_duration_tolerance() {
    let (_, slots) = reference();
    let frames = vec![
        frame(101, 20, "promotion", 0, 7_999),
        frame(102, 21, "promotion", 0, 8_000),
        frame(103, 22, "promotion", 0, 12_000),
        frame(104, 23, "promotion", 0, 12_001),
        frame(105, 24, "promotion", 0, 60_000),
    ];
    let options = slot_options(&slots[1], &frames, &[], true, 7);
    let ids: HashSet<Uuid> = options.iter().flat_map(|o| o.segment_ids()).collect();
    assert_eq!(
        ids,
        HashSet::from([Uuid::from_u128(102), Uuid::from_u128(103)])
    );
}

/// 口播 fallbacks keep their points (`fallback_reference_retains_its_repeat_budget`);
/// a claim inside a 机制 replacement is not a selling point and cannot repeat one.
#[test]
fn fallback_points_outside_mixed_voiceover_do_not_count_as_repetition() {
    let (ref_frames, slots) = reference();
    let (mut frames, mut points) = material();
    points.push(point(501, 50, "moisturizing", 0, 9_000, false));
    frames.extend(ref_frames);
    let blocks = all_blocks(&frames, &points);
    let options: Vec<_> = slots
        .iter()
        .map(|s| slot_options(s, &frames, &blocks, false, 7))
        .collect();
    let fallback = options[1]
        .iter()
        .position(|o| o.clips[0].asset_id == Uuid::from_u128(50))
        .unwrap();
    assert!(options[1][fallback].clips[0].selling_points.is_empty());
    assert!(options[1][fallback].clips[0].point_guard_ids.is_empty());
    let selected = select(
        &options,
        50,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert!(selected.combos.iter().any(|c| c.picks[1] == fallback));
}

#[test]
fn fallback_and_point_clips_cannot_reuse_overlapping_source_time() {
    let frames = vec![frame(1, 10, "mixed_voiceover", 0, 20_000)];
    let blocks = all_blocks(
        &frames,
        &[
            point(11, 10, "skincare", 0, 5_000, false),
            point(12, 10, "moisturizing", 10_000, 15_000, false),
        ],
    );
    let whole = SlotOption {
        clips: vec![frame_clip(&frames[0], &blocks)],
        tier: Tier::Exact,
        fallback: true,
    };
    let limits = Limits {
        max_total_ms: 60_000,
        max_sources: 2,
        // Repetition is allowed here so it cannot hide the overlapping-media bug.
        allowance: HashMap::from([("skincare".into(), 2), ("moisturizing".into(), 2)]),
    };
    for (asset, start, end, valid) in [
        (10, 0, 5_000, false),
        (10, 19_000, 24_000, false),
        (10, 20_000, 25_000, true),
        (20, 0, 5_000, true),
    ] {
        let mut clip = block_clip(&blocks[0]);
        clip.asset_id = Uuid::from_u128(asset);
        clip.start_ms = start;
        clip.end_ms = end;
        let part = SlotOption {
            clips: vec![clip],
            tier: Tier::Spliced,
            fallback: false,
        };
        // The fallback and point have distinct IDs. Both slot orders must be safe.
        for options in [
            vec![vec![whole.clone()], vec![part.clone()]],
            vec![vec![part.clone()], vec![whole.clone()]],
        ] {
            let selected = select(&options, 1, 5, &limits, &HashSet::new(), "");
            assert_eq!(
                selected.combos.len(),
                usize::from(valid),
                "{asset}:{start}–{end}"
            );
        }
    }
}

#[test]
fn fallback_reference_retains_its_repeat_budget() {
    let frames = vec![frame(1, 10, "mixed_voiceover", 0, 20_000)];
    let points = vec![
        point(11, 10, "moisturizing", 0, 10_000, false),
        point(12, 10, "moisturizing", 10_000, 16_000, true),
        point(13, 10, "skincare", 16_000, 20_000, true),
    ];
    let slots = reference_slots(&frames, &build_blocks(&frames, &points));
    assert!(slots[0].fallback);
    assert_eq!(
        slots[0].target,
        vec!["moisturizing", "moisturizing", "skincare"]
    );
    assert_eq!(repeat_allowance(&slots)["moisturizing"], 2);
    let candidates = vec![
        frame(101, 20, "mixed_voiceover", 0, 20_000),
        frame(102, 30, "mixed_voiceover", 0, 20_000),
    ];
    let points = vec![
        point(201, 20, "moisturizing", 0, 10_000, false),
        point(202, 20, "moisturizing", 10_000, 16_000, true),
        point(203, 20, "skincare", 16_000, 20_000, true),
        point(301, 30, "moisturizing", 0, 6_000, false),
        point(302, 30, "moisturizing", 6_000, 12_000, true),
        point(303, 30, "moisturizing", 12_000, 16_000, true),
        point(304, 30, "skincare", 16_000, 20_000, true),
    ];
    let options = vec![slot_options(
        &slots[0],
        &candidates,
        &all_blocks(&candidates, &points),
        true,
        7,
    )];
    let selected = select(
        &options,
        10,
        7,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(
        selected.combos.len(),
        1,
        "keep two repetitions, reject a third"
    );
    assert_eq!(
        options[0][selected.combos[0].picks[0]].clips[0].asset_id,
        Uuid::from_u128(20)
    );
}

#[test]
fn known_cross_frame_and_unresolved_continuity_are_unsafe() {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 20_000),
        frame(2, 10, "mixed_voiceover", 20_000, 30_000),
    ];
    let mut points = vec![
        point(11, 10, "moisturizing", 10_000, 20_000, false),
        point(12, 10, "long_wear", 20_000, 30_000, true),
    ];
    assert_eq!(
        unsafe_frame_ids(&frames, &points),
        HashSet::from([Uuid::from_u128(1), Uuid::from_u128(2)])
    );
    points[1].continues_previous = false;
    assert!(
        unsafe_frame_ids(&frames, &points).is_empty(),
        "a confirmed hard cut stays usable"
    );
    points[0].continues_previous = true;
    assert_eq!(
        unsafe_frame_ids(&frames, &points),
        HashSet::from([Uuid::from_u128(1)]),
        "missing predecessor must not be silently cut"
    );
    points[0].continues_previous = false;
    points[0].end_ms = 21_000;
    assert_eq!(
        unsafe_frame_ids(&frames, &points),
        HashSet::from([Uuid::from_u128(1), Uuid::from_u128(2)]),
        "a selling point straddling the framework boundary is unsafe"
    );
}

#[test]
fn confirmed_continuity_keeps_unlabelled_speech_between_points() {
    let frames = vec![frame(1, 10, "mixed_voiceover", 0, 40_000)];
    let points = vec![
        point(11, 10, "moisturizing", 0, 10_000, false),
        point(12, 10, "long_wear", 16_400, 30_000, true),
    ];
    assert!(unsafe_frame_ids(&frames, &points).is_empty());
    let blocks = all_blocks(&frames, &points);
    assert_eq!(blocks.len(), 1);
    let clip = block_clip(&blocks[0]);
    assert_eq!(
        (clip.start_ms, clip.end_ms),
        (0, 30_000),
        "retain the 6.4-second unlabelled interval"
    );
    assert_eq!(
        clip.segment_ids,
        vec![Uuid::from_u128(11), Uuid::from_u128(12)]
    );
}

pub(super) fn limits(slots: &[RefSlot], max_total_ms: u64) -> Limits {
    Limits {
        max_total_ms,
        max_sources: 50,
        allowance: repeat_allowance(slots),
    }
}

#[test]
fn every_output_requires_both_business_points_including_fallbacks_without_fixed_order() {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 10_000),
        frame(2, 20, "mixed_voiceover", 0, 10_000),
        frame(3, 30, "mixed_voiceover", 0, 10_000),
        frame(4, 40, "mixed_voiceover", 0, 10_000),
    ];
    let points = vec![
        point(11, 10, "moisturizing", 0, 5_000, false),
        point(12, 10, "skincare", 5_000, 10_000, true),
        point(21, 20, "moisturizing", 0, 10_000, false),
        point(31, 30, "skincare", 0, 10_000, false),
        point(41, 40, "skincare", 0, 5_000, false),
        point(42, 40, "moisturizing", 5_000, 10_000, true),
    ];
    let slots = reference_slots(&frames[..1], &build_blocks(&frames[..1], &points));
    let options = vec![slot_options(
        &slots[0],
        &frames,
        &all_blocks(&frames, &points),
        true,
        3,
    )];
    assert!(options[0].iter().all(|option| option.fallback));
    let selected = select(
        &options,
        10,
        3,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(
        selected.combos.len(),
        1,
        "neither required point may be missing"
    );
    assert_eq!(
        options[0][selected.combos[0].picks[0]].clips[0].asset_id,
        Uuid::from_u128(40),
        "reversed required-point order remains valid"
    );

    let mut unknown = options[0][selected.combos[0].picks[0]].clone();
    unknown.clips[0].selling_points.clear();
    assert_eq!(
        select(
            &[vec![unknown]],
            10,
            3,
            &limits(&slots, 600_000),
            &HashSet::new(),
            ""
        )
        .available,
        0,
        "an unannotated fallback is not evidence of required points"
    );
}

#[test]
fn mandatory_points_are_checked_across_slots_and_all_fill_tiers() {
    let (slots, mut options) = plan_options(true);
    // Remove skincare evidence from every mixed_voiceover option. Enriching
    // the separate fallback slot with confirmed skincare makes every tier usable.
    for option in &mut options[0] {
        for clip in &mut option.clips {
            for label in &mut clip.selling_points {
                if label == "skincare" {
                    *label = "long_wear".into();
                }
            }
        }
    }
    let absent = select(
        &options,
        50,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        "",
    );
    assert_eq!(absent.available, 0);
    for option in &mut options[1] {
        option.clips[0].selling_points.push("skincare".into());
    }
    let present = select(
        &options,
        50,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        "",
    );
    assert!(present.available > 0);
    assert!([Tier::Exact, Tier::Spliced, Tier::Varied]
        .iter()
        .all(|tier| present.combos.iter().any(|combo| combo.tier == *tier)));
}

fn plan_options(allow_variation: bool) -> (Vec<RefSlot>, Vec<Vec<SlotOption>>) {
    let (ref_frames, slots) = reference();
    let (mut frames, points) = material();
    frames.extend(ref_frames);
    let blocks = all_blocks(&frames, &points);
    let options = slots
        .iter()
        .map(|s| slot_options(s, &frames, &blocks, allow_variation, 3))
        .collect();
    (slots, options)
}

#[test]
fn selection_prefers_lower_tiers_is_deterministic_and_excludes_history() {
    let (slots, options) = plan_options(true);
    let reference = reference_hash(&slots);
    let all = select(
        &options,
        10,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert!(all.exact);
    // mixed_voiceover: exact / spliced / varied (3); promotion: own + other asset (2) → 6, minus the reference.
    let tiers: Vec<Tier> = all.combos.iter().map(|c| c.tier).collect();
    let mut sorted = tiers.clone();
    sorted.sort();
    assert_eq!(tiers, sorted, "lower tiers come first");
    assert!(tiers.contains(&Tier::Varied));
    assert!(all.combos.iter().all(|c| c.hash != reference));
    let again = select(
        &options,
        10,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(
        all.combos.iter().map(|c| &c.hash).collect::<Vec<_>>(),
        again.combos.iter().map(|c| &c.hash).collect::<Vec<_>>()
    );
    let used: HashSet<String> = all.combos.iter().take(2).map(|c| c.hash.clone()).collect();
    let next = select(
        &options,
        10,
        5,
        &limits(&slots, 600_000),
        &used,
        &reference_hash(&slots),
    );
    assert_eq!(next.previously_used, 2);
    assert!(next.combos.iter().all(|c| !used.contains(&c.hash)));
    // Only exact fills when one combination is enough.
    let one = select(
        &options,
        1,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(one.combos[0].tier, Tier::Exact);
}

#[test]
fn a_selling_point_never_repeats_across_the_film_and_duration_is_bounded() {
    let (slots, mut options) = plan_options(false);
    // Duplicate the mixed_voiceover slot: the same selling points twice are invalid.
    options.push(options[0].clone());
    let picked = select(
        &options,
        50,
        5,
        &limits(&slots, 600_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(picked.available, 0);
    let (slots, options) = plan_options(false);
    let tight = select(
        &options,
        10,
        5,
        &limits(&slots, 2_999),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert!(tight.combos.is_empty());
}

#[test]
fn a_crowded_pool_is_searched_within_budget_and_keeps_exact_fills() {
    let (_, slots) = reference();
    // 600 one-point blocks (every one a valid spliced/varied piece) plus a
    // single exact block: the exact fill must survive and the search stays bounded.
    let mut frames = Vec::new();
    let mut points = Vec::new();
    for n in 0..600u128 {
        frames.push(frame(10_000 + n, 5_000 + n, "mixed_voiceover", 0, 40_000));
        let label = if n % 2 == 0 {
            "moisturizing"
        } else {
            "skincare"
        };
        points.push(point(20_000 + n, 5_000 + n, label, 0, 11_000, false));
    }
    frames.push(frame(9_999, 9_999, "mixed_voiceover", 0, 40_000));
    points.push(point(9_001, 9_999, "moisturizing", 0, 10_000, false));
    points.push(point(9_002, 9_999, "skincare", 10_000, 20_000, true));
    let blocks = all_blocks(&frames, &points);
    let started = std::time::Instant::now();
    let options = slot_options(&slots[0], &frames, &blocks, true, 11);
    assert!(started.elapsed() < std::time::Duration::from_secs(5));
    assert!(options.iter().any(|o| o.tier == Tier::Exact
        && o.clips[0].segment_ids == vec![Uuid::from_u128(9_001), Uuid::from_u128(9_002)]));
    for tier in [Tier::Exact, Tier::Spliced, Tier::Varied] {
        assert!(options.iter().filter(|o| o.tier == tier).count() <= MAX_OPTIONS_PER_TIER);
    }
}

#[test]
fn repeated_points_fall_back_inside_a_slot_and_are_allowed_as_often_as_the_reference_uses_them() {
    let frames = vec![frame(1, 10, "mixed_voiceover", 0, 40_000)];
    let points = vec![
        point(11, 10, "moisturizing", 0, 10_000, false),
        point(12, 10, "long_wear", 12_000, 20_000, false),
        point(13, 10, "moisturizing", 22_000, 30_000, false),
    ];
    assert!(reference_slots(&frames, &build_blocks(&frames, &points))[0].fallback);
    let (_, slots) = reference();
    let mut twice = slots.clone();
    twice.push(slots[0].clone());
    assert_eq!(repeat_allowance(&twice)["moisturizing"], 2);
    let (_, options) = plan_options(false);
    let doubled = vec![options[0].clone(), options[0].clone()];
    let allowed = select(
        &doubled,
        50,
        5,
        &limits(&twice, 600_000),
        &HashSet::new(),
        &reference_hash(&twice),
    );
    assert!(
        allowed.available > 0,
        "the reference itself repeats the points"
    );
}

#[test]
fn combinations_over_the_source_ceiling_are_never_selected() {
    let (slots, options) = plan_options(true);
    let mut tight = limits(&slots, 600_000);
    tight.max_sources = 1;
    let one_source = select(
        &options,
        50,
        5,
        &tight,
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert!(
        one_source.combos.is_empty(),
        "every fill mixes the mixed_voiceover and promotion sources"
    );
}
