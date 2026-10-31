//! 类型 2: reference exclusion by source and the order of multi-label sentences.
use super::tests::{all_blocks, frame, limits, point};
use super::*;

/// A 口播 slot whose points cover only part of it takes whole segments, the
/// reference's own segment among them. Its block ids and its whole segment id
/// differ, so the rebuilt original must be recognised by source.
#[test]
fn a_reference_rebuilt_from_its_own_whole_segment_is_excluded() {
    let frames = vec![
        frame(1, 10, "mixed_voiceover", 0, 15_000),
        frame(2, 20, "mixed_voiceover", 0, 15_000),
    ];
    let mut own = point(11, 10, "moisturizing", 0, 3_000, false);
    own.additional_label_keys = vec!["skincare".into()];
    let mut other = point(21, 20, "moisturizing", 0, 4_000, false);
    other.additional_label_keys = vec!["skincare".into()];
    let points = vec![own, other];
    let slots = reference_slots(&frames[..1], &build_blocks(&frames[..1], &points[..1]));
    assert!(!slots[0].fallback);
    let options = slot_options(&slots[0], &frames, &all_blocks(&frames, &points), true, 1);
    assert_eq!(options.len(), 2);
    assert!(options.iter().all(|o| o.fallback));
    assert_eq!(options.iter().filter(|o| o.reference).count(), 1);

    let selection = select(&[options], 5, 1, &limits(&slots, 60_000), &HashSet::new());
    assert!(selection.reference_excluded);
    assert_eq!(selection.combos.len(), 1);
    assert_eq!(
        selection.combos[0].hash,
        combination_hash(&[Uuid::from_u128(2)])
    );
}

/// One sentence carrying two points has no internal order, so it reproduces
/// two reference sentences in either order as an exact fill. Two sentences in
/// the opposite order remain a variation.
#[test]
fn one_sentence_with_two_points_fills_two_reference_sentences_exactly() {
    let refs = vec![frame(1, 10, "mixed_voiceover", 0, 20_000)];
    let slots = reference_slots(
        &refs,
        &build_blocks(
            &refs,
            &[
                point(11, 10, "skincare", 0, 8_000, false),
                point(12, 10, "moisturizing", 9_000, 17_000, true),
            ],
        ),
    );
    assert!(!slots[0].fallback);
    let frames = vec![
        frame(2, 20, "mixed_voiceover", 0, 20_000),
        frame(3, 30, "mixed_voiceover", 0, 20_000),
    ];
    let mut both = point(21, 20, "skincare", 0, 17_000, false);
    both.additional_label_keys = vec!["moisturizing".into()];
    let points = vec![
        both,
        point(31, 30, "moisturizing", 0, 8_000, false),
        point(32, 30, "skincare", 9_000, 17_000, true),
    ];
    let options = slot_options(&slots[0], &frames, &all_blocks(&frames, &points), true, 1);
    let tier_of = |asset: u128| {
        options
            .iter()
            .find(|o| o.clips[0].asset_id == Uuid::from_u128(asset))
            .map(|o| o.tier)
    };
    assert_eq!(tier_of(20), Some(Tier::Exact));
    assert_eq!(tier_of(30), Some(Tier::Varied));
}

#[test]
fn same_points_only_constrains_order_between_segments() {
    let keys = |segments: &[&[&str]]| -> Vec<Vec<String>> {
        segments
            .iter()
            .map(|keys| keys.iter().map(|key| key.to_string()).collect())
            .collect()
    };
    let same = |left: &[&[&str]], right: &[&[&str]]| same_points(&keys(left), &keys(right));
    assert!(same(&[&["b"], &["a"]], &[&["a", "b"]]));
    assert!(same(&[&["a", "c"], &["b"]], &[&["a"], &["b", "c"]]));
    assert!(same(&[&["star_endorsement"]], &[&["kol_endorsement"]]));
    assert!(!same(&[&["b", "c"], &["a"]], &[&["a"], &["b", "c"]]));
    assert!(!same(&[&["a"], &["b"]], &[&["b"], &["a"]]));
    assert!(!same(&[&["a"]], &[&["a"], &["b"]]));
    assert!(
        !same(&[&["a", "a"]], &[&["a", "a"]]),
        "points repeat within a slot"
    );
}

#[test]
fn extends_points_follows_some_order_of_the_target() {
    let keys = |segments: &[&[&str]]| -> Vec<Vec<String>> {
        segments
            .iter()
            .map(|keys| keys.iter().map(|key| key.to_string()).collect())
            .collect()
    };
    let extends = |prefix: &[&[&str]]| extends_points(&keys(prefix), &keys(&[&["a", "b"], &["c"]]));
    assert!(extends(&[&["b"]]));
    assert!(extends(&[&["b"], &["a"]]));
    assert!(extends(&[&["a", "b"], &["c"]]));
    assert!(!extends(&[&["c"]]), "c must follow a and b");
    assert!(!extends(&[&["a"], &["a"]]));
    assert!(!extends(&[&["d"]]));
}

/// Exact and spliced searches only walk in-order prefixes, so a crowded pool
/// of single-point blocks finds its fills well inside the node budget.
#[test]
fn spliced_search_prunes_out_of_order_prefixes() {
    let refs = vec![frame(1, 10, "mixed_voiceover", 0, 12_000)];
    let slots = reference_slots(
        &refs,
        &build_blocks(
            &refs,
            &[
                point(11, 10, "moisturizing", 0, 3_000, false),
                point(12, 10, "skincare", 4_000, 7_000, false),
                point(13, 10, "long_wear", 8_000, 11_000, false),
            ],
        ),
    );
    let mut frames = Vec::new();
    let mut points = Vec::new();
    for (offset, label) in [(100, "moisturizing"), (200, "skincare"), (300, "long_wear")] {
        for i in 0..20 {
            let asset = offset + i;
            frames.push(frame(1_000 + asset, asset, "mixed_voiceover", 0, 10_000));
            points.push(point(2_000 + asset, asset, label, 0, 3_500, false));
        }
    }
    let blocks = all_blocks(&frames, &points);
    let pool: Vec<&Block> = blocks.iter().collect();
    let mut search = Search {
        slot: &slots[0],
        pool: &pool,
        tier: Tier::Spliced,
        stack: Vec::new(),
        found: Vec::new(),
        visits: 0,
    };
    search.extend(0, 0);
    assert_eq!(search.found.len(), 8_000.min(MAX_RAW_PER_TIER));
    assert!(search.visits < 10_000, "{} visits", search.visits);
}
