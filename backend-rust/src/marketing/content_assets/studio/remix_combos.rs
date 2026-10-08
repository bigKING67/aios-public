//! Deterministic framework remix combinations (pure; no model involvement).
//! A combination picks one candidate per ordered slot. It is valid when no
//! segment appears twice and the total duration stays within 3 s..max. Small
//! spaces are enumerated completely and shuffled with a seeded PRNG (exact
//! availability); large spaces are sampled with the same PRNG (availability is
//! a lower bound). The same input and seed always yield the same order.
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use uuid::Uuid;

/// Spaces up to this size are enumerated (exact counts).
pub(super) const ENUMERATION_LIMIT: u64 = 100_000;
const SAMPLE_ATTEMPTS_PER_ITEM: usize = 64;
const MAX_SAMPLE_ATTEMPTS: usize = 20_000;
pub(super) const MIN_TOTAL_MS: u64 = 3_000;

#[derive(Clone, Debug)]
pub(super) struct Candidate {
    pub(super) segment_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) label_key: String,
    pub(super) source_content_hash: String,
}

impl Candidate {
    pub(super) fn duration_ms(&self) -> u64 {
        u64::try_from(self.end_ms.saturating_sub(self.start_ms)).unwrap_or(0)
    }
}

#[derive(Debug)]
pub(super) struct Combination {
    /// Candidate index per slot.
    pub(super) picks: Vec<usize>,
    pub(super) hash: String,
}

#[derive(Debug)]
pub(super) struct Selection {
    pub(super) combos: Vec<Combination>,
    pub(super) theoretical: u64,
    pub(super) available: u64,
    pub(super) exact: bool,
    pub(super) previously_used: u64,
    /// The reference original's own combination was met and skipped.
    pub(super) reference_excluded: bool,
}

/// SHA-256 of the ordered segment ids; the batch-level dedupe key.
pub(super) fn combination_hash(segment_ids: &[Uuid]) -> String {
    let mut hasher = Sha256::new();
    for (index, id) in segment_ids.iter().enumerate() {
        if index > 0 {
            hasher.update(b"\n");
        }
        hasher.update(id.hyphenated().to_string().as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

struct SplitMix64(u64);

impl SplitMix64 {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Unbiased value in `0..bound` (bound > 0) by rejection sampling.
    fn below(&mut self, bound: u64) -> u64 {
        let zone = u64::MAX - (u64::MAX % bound);
        loop {
            let value = self.next();
            if value < zone {
                return value % bound;
            }
        }
    }
}

enum Verdict {
    Invalid,
    Used(String),
    Reference,
    Valid(Combination),
}

fn evaluate(
    slots: &[Vec<Candidate>],
    picks: Vec<usize>,
    max_total_ms: u64,
    used: &HashSet<String>,
    reference: Option<&str>,
) -> Verdict {
    let chosen: Vec<&Candidate> = picks
        .iter()
        .zip(slots)
        .map(|(pick, slot)| &slot[*pick])
        .collect();
    let ids: Vec<Uuid> = chosen.iter().map(|c| c.segment_id).collect();
    if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Verdict::Invalid;
    }
    let total_ms: u64 = chosen.iter().map(|c| c.duration_ms()).sum();
    if !(MIN_TOTAL_MS..=max_total_ms).contains(&total_ms) {
        return Verdict::Invalid;
    }
    let hash = combination_hash(&ids);
    if reference == Some(hash.as_str()) {
        return Verdict::Reference;
    }
    if used.contains(&hash) {
        return Verdict::Used(hash);
    }
    Verdict::Valid(Combination { picks, hash })
}

fn decode(mut index: u64, slots: &[Vec<Candidate>]) -> Vec<usize> {
    let mut picks = vec![0; slots.len()];
    for (slot, pick) in slots.iter().zip(picks.iter_mut()).rev() {
        let radix = slot.len() as u64;
        *pick = (index % radix) as usize;
        index /= radix;
    }
    picks
}

pub(super) fn theoretical(slots: &[Vec<Candidate>]) -> u64 {
    slots
        .iter()
        .fold(1u64, |acc, slot| acc.saturating_mul(slot.len() as u64))
}

/// `reference`: hash of the reference original's own segments, never selected
/// (an output identical to the original is not a remix).
pub(super) fn select(
    slots: &[Vec<Candidate>],
    count: usize,
    seed: u64,
    max_total_ms: u64,
    used: &HashSet<String>,
    reference: Option<&str>,
) -> Selection {
    let space = theoretical(slots);
    let mut selection = Selection {
        combos: Vec::new(),
        theoretical: space,
        available: 0,
        exact: true,
        previously_used: 0,
        reference_excluded: false,
    };
    if slots.is_empty() || space == 0 {
        selection.theoretical = 0;
        return selection;
    }
    let mut rng = SplitMix64(seed);
    if space <= ENUMERATION_LIMIT {
        let mut valid = Vec::new();
        for index in 0..space {
            match evaluate(slots, decode(index, slots), max_total_ms, used, reference) {
                Verdict::Valid(combo) => valid.push(combo),
                Verdict::Used(_) => selection.previously_used += 1,
                Verdict::Reference => selection.reference_excluded = true,
                Verdict::Invalid => {}
            }
        }
        // Seeded Fisher–Yates over the canonical enumeration order.
        for i in (1..valid.len()).rev() {
            let j = rng.below(i as u64 + 1) as usize;
            valid.swap(i, j);
        }
        selection.available = valid.len() as u64;
        valid.truncate(count);
        selection.combos = valid;
        return selection;
    }
    selection.exact = false;
    let mut seen = HashSet::new();
    let mut used_seen = HashSet::new();
    let attempts = count
        .saturating_mul(SAMPLE_ATTEMPTS_PER_ITEM)
        .min(MAX_SAMPLE_ATTEMPTS);
    for _ in 0..attempts {
        if selection.combos.len() >= count {
            break;
        }
        let picks = slots
            .iter()
            .map(|slot| rng.below(slot.len() as u64) as usize)
            .collect();
        match evaluate(slots, picks, max_total_ms, used, reference) {
            Verdict::Valid(combo) => {
                if seen.insert(combo.hash.clone()) {
                    selection.combos.push(combo);
                }
            }
            Verdict::Used(hash) => {
                used_seen.insert(hash);
            }
            Verdict::Reference => selection.reference_excluded = true,
            Verdict::Invalid => {}
        }
    }
    selection.available = selection.combos.len() as u64;
    selection.previously_used = used_seen.len() as u64;
    selection
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(n: u128, label: &str, start: i32, end: i32) -> Candidate {
        Candidate {
            segment_id: Uuid::from_u128(n),
            asset_id: Uuid::from_u128(1000 + n % 3),
            start_ms: start,
            end_ms: end,
            label_key: label.into(),
            source_content_hash: "a".repeat(64),
        }
    }

    fn slots() -> Vec<Vec<Candidate>> {
        vec![
            vec![candidate(1, "a", 0, 5000), candidate(2, "a", 0, 6000)],
            vec![
                candidate(3, "b", 0, 4000),
                candidate(4, "b", 0, 4000),
                candidate(5, "b", 0, 4000),
            ],
            vec![candidate(1, "a", 0, 5000), candidate(2, "a", 0, 6000)],
        ]
    }

    fn ids(slots: &[Vec<Candidate>], combo: &Combination) -> Vec<Uuid> {
        combo
            .picks
            .iter()
            .zip(slots)
            .map(|(p, s)| s[*p].segment_id)
            .collect()
    }

    #[test]
    fn enumeration_is_exact_deterministic_and_never_repeats_a_segment() {
        let slots = slots();
        let used = HashSet::new();
        let a = select(&slots, 100, 42, 600_000, &used, None);
        // 2*3*2 = 12 raw; slot 1 and 3 share segments → 6 repeat one segment.
        assert_eq!(a.theoretical, 12);
        assert_eq!(a.available, 6);
        assert!(a.exact);
        assert_eq!(a.combos.len(), 6);
        for combo in &a.combos {
            let ids = ids(&slots, combo);
            assert_eq!(ids.iter().collect::<HashSet<_>>().len(), ids.len());
            assert_eq!(combo.hash, combination_hash(&ids));
        }
        let hashes: HashSet<_> = a.combos.iter().map(|c| c.hash.clone()).collect();
        assert_eq!(hashes.len(), 6);
        let b = select(&slots, 3, 42, 600_000, &used, None);
        assert_eq!(
            b.combos.iter().map(|c| &c.hash).collect::<Vec<_>>(),
            a.combos.iter().take(3).map(|c| &c.hash).collect::<Vec<_>>()
        );
        let c = select(&slots, 6, 7, 600_000, &used, None);
        assert_ne!(
            c.combos.iter().map(|c| &c.hash).collect::<Vec<_>>(),
            a.combos.iter().map(|c| &c.hash).collect::<Vec<_>>(),
            "another seed shuffles differently"
        );
    }

    #[test]
    fn the_reference_combination_is_never_selected_nor_counted_as_used() {
        let slots = slots();
        let all = select(&slots, 100, 42, 600_000, &HashSet::new(), None);
        let reference = all.combos[0].hash.clone();
        let rest = select(&slots, 100, 42, 600_000, &HashSet::new(), Some(&reference));
        assert_eq!(rest.available, all.available - 1);
        assert_eq!(rest.previously_used, 0);
        assert!(rest.reference_excluded);
        assert!(rest.combos.iter().all(|c| c.hash != reference));
        let other = select(
            &slots,
            100,
            42,
            600_000,
            &HashSet::new(),
            Some(&"0".repeat(64)),
        );
        assert!(!other.reference_excluded);
        assert_eq!(other.available, all.available);
    }

    #[test]
    fn used_combinations_duration_bounds_and_empty_slots() {
        let slots = slots();
        let first = select(&slots, 2, 1, 600_000, &HashSet::new(), None);
        let used: HashSet<String> = first.combos.iter().map(|c| c.hash.clone()).collect();
        let next = select(&slots, 10, 1, 600_000, &used, None);
        assert_eq!(next.available, 4);
        assert_eq!(next.previously_used, 2);
        assert!(next.combos.iter().all(|c| !used.contains(&c.hash)));
        // 5+4+6 = 15 s is the only length; a 14.999 s ceiling rejects all.
        assert_eq!(
            select(&slots, 10, 1, 14_999, &HashSet::new(), None).available,
            0
        );
        let mut empty = slots.clone();
        empty[1].clear();
        let none = select(&empty, 10, 1, 600_000, &HashSet::new(), None);
        assert_eq!((none.theoretical, none.available), (0, 0));
        let short = vec![vec![candidate(9, "a", 0, 2999)]];
        assert_eq!(
            select(&short, 1, 1, 600_000, &HashSet::new(), None).available,
            0
        );
    }

    #[test]
    fn large_spaces_are_sampled_deterministically_as_a_lower_bound() {
        let slot = |offset: u128| -> Vec<Candidate> {
            (0..60)
                .map(|i| candidate(offset + i, "x", 0, 1000))
                .collect()
        };
        let slots = vec![slot(0), slot(100), slot(200), slot(300)];
        let a = select(&slots, 10, 9, 600_000, &HashSet::new(), None);
        assert!(!a.exact);
        assert_eq!(a.theoretical, 60u64.pow(4));
        assert_eq!(a.combos.len(), 10);
        let b = select(&slots, 10, 9, 600_000, &HashSet::new(), None);
        assert_eq!(
            a.combos.iter().map(|c| &c.hash).collect::<Vec<_>>(),
            b.combos.iter().map(|c| &c.hash).collect::<Vec<_>>()
        );
        assert_eq!(
            a.combos
                .iter()
                .map(|c| &c.hash)
                .collect::<HashSet<_>>()
                .len(),
            10
        );
    }

    #[test]
    fn hash_is_order_sensitive() {
        let (a, b) = (Uuid::from_u128(1), Uuid::from_u128(2));
        assert_ne!(combination_hash(&[a, b]), combination_hash(&[b, a]));
        assert_eq!(combination_hash(&[a, b]).len(), 64);
    }
}
