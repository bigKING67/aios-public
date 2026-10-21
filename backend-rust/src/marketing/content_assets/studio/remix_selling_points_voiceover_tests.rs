//! 类型 2: selling points only count inside 混剪口播 framework segments.
use super::tests::{all_blocks, frame, limits, point};
use super::*;

/// 实拍、街采、机制、KOC are whole 类型 1 units: their selling points neither
/// shape the reference slot, nor satisfy the required points, nor use the
/// repeat budget, nor block the frame through old endorsement or continuity.
#[test]
fn points_outside_mixed_voiceover_are_ignored() {
    let refs = vec![
        frame(1, 10, "mixed_voiceover", 0, 10_000),
        frame(2, 10, "street_interview", 10_000, 20_000),
    ];
    let ref_points = vec![
        point(11, 10, "moisturizing", 0, 9_000, false),
        point(12, 10, "skincare", 10_000, 19_000, false),
    ];
    let slots = reference_slots(&refs, &build_blocks(&refs, &ref_points));
    assert_eq!(slots[0].target, ["moisturizing"]);
    assert!(slots[1].fallback && slots[1].target.is_empty());
    assert_eq!(repeat_allowance(&slots).get("skincare"), None);

    let frames = vec![
        frame(3, 20, "mixed_voiceover", 0, 10_000),
        frame(4, 20, "street_interview", 10_000, 20_000),
    ];
    let mut street_skincare = point(22, 20, "skincare", 10_000, 19_000, true);
    street_skincare.additional_label_keys = vec!["celebrity_endorsement".into()];
    let mut points = vec![
        point(21, 20, "moisturizing", 0, 9_000, false),
        street_skincare,
    ];
    assert_eq!(
        unsafe_frame_ids(&frames, &points),
        HashSet::from([Uuid::from_u128(3)]),
        "speech running on into 街采 keeps the 混剪口播 frame uncut; 街采 itself stays usable"
    );
    points[1].continues_previous = false;
    assert!(unsafe_frame_ids(&frames, &points).is_empty());
    let blocks = all_blocks(&frames, &points);
    assert_eq!(blocks.len(), 1);
    let street = slot_options(&slots[1], &frames, &blocks, true, 1);
    assert_eq!(street.len(), 1);
    assert!(street[0].clips[0].selling_points.is_empty());
    assert!(street[0].clips[0].point_guard_ids.is_empty());

    // The 街采 skincare does not satisfy the required points.
    let voice = slot_options(&slots[0], &frames, &blocks, true, 1);
    assert_eq!(voice.len(), 1);
    let selection = select(
        &[voice, street],
        5,
        1,
        &limits(&slots, 60_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert!(selection.combos.is_empty());
}

/// A 口播 slot whose only point covers 6 s of 15 s has no block fill of
/// matching length; whole 口播 segments fill it as the last, varied resort.
#[test]
fn a_partly_covered_voiceover_slot_takes_whole_segments_only_without_block_fills() {
    let refs = vec![frame(1, 10, "mixed_voiceover", 0, 15_000)];
    let slots = reference_slots(
        &refs,
        &build_blocks(
            &refs,
            &[point(11, 10, "kol_endorsement", 5_000, 11_000, false)],
        ),
    );
    assert!(!slots[0].fallback);
    let frames = vec![
        frame(2, 20, "mixed_voiceover", 0, 16_000),
        frame(3, 30, "mixed_voiceover", 0, 14_000),
        frame(4, 40, "street_interview", 0, 15_000),
    ];
    let mut both = point(21, 20, "moisturizing", 0, 8_000, false);
    both.additional_label_keys = vec!["skincare".into()];
    let points = vec![both, point(31, 30, "expert_endorsement", 0, 6_000, false)];
    let blocks = all_blocks(&frames, &points);
    let options = slot_options(&slots[0], &frames, &blocks, true, 3);
    // The expert segment cannot replace a KOL; 街采 is another framework.
    assert_eq!(options.len(), 1);
    let option = &options[0];
    assert!(option.fallback);
    assert_eq!(option.tier, Tier::Varied);
    assert_eq!(option.clips[0].segment_ids, [Uuid::from_u128(2)]);
    assert_eq!(option.clips[0].point_guard_ids, [Uuid::from_u128(21)]);
    assert_eq!(option.clips[0].selling_points, ["moisturizing", "skincare"]);
    let selection = select(
        &[options],
        1,
        1,
        &limits(&slots, 60_000),
        &HashSet::new(),
        &reference_hash(&slots),
    );
    assert_eq!(selection.combos.len(), 1);
    assert_eq!(selection.combos[0].tier, Tier::Varied);

    // With a matching block fill the whole segments are not offered.
    let kol = point(22, 20, "kol_endorsement", 0, 14_000, false);
    let blocks = all_blocks(&frames, &[kol]);
    let options = slot_options(&slots[0], &frames, &blocks, true, 3);
    assert!(options.iter().all(|o| !o.fallback));
    assert!(!options.is_empty());
}
